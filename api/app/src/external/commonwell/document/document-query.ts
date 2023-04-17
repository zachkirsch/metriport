import { CommonwellError, DocumentQueryResponse, Document } from "@metriport/commonwell-sdk";
import stream from "stream";
import * as AWS from "aws-sdk";
import { updateDocQueryStatus } from "../../../command/medical/document/document-query";
import { Patient } from "../../../models/medical/patient";
import { Organization } from "../../../models/medical/organization";
import { Facility } from "../../../models/medical/facility";
import { capture } from "../../../shared/notifications";
import { oid } from "../../../shared/oid";
import { Util } from "../../../shared/util";
import { makeCommonWellAPI, organizationQueryMeta } from "../api";
import { getPatientData, PatientDataCommonwell } from "../patient-shared";
import { downloadDocument } from "./document-download";
import { upsertDocumentToFHIRServer } from "../../fhir/document/save-document-reference";
import { toFHIR as toFHIRDocRef } from "../../fhir/document";
import { DocumentWithFilename } from "./shared";
import { Config } from "../../../shared/config";
import { createS3FileName } from "../../../shared/external";

const s3client = new AWS.S3();

/**
 * This is likely to be a long-running function
 */
export async function queryDocuments({
  patient,
  facilityId,
}: {
  patient: Patient;
  facilityId: string;
}): Promise<void> {
  try {
    if (Config.isSandbox()) {
      return;
    }

    const { organization, facility } = await getPatientData(patient, facilityId);

    const cwDocuments = await internalGetDocuments({ patient, organization, facility });

    const docsS3Refs = await dowloadAndUploadDocsToS3({
      patient,
      facilityId,
      documents: cwDocuments,
    });

    for (const doc of docsS3Refs) {
      const FHIRDocRef = toFHIRDocRef(doc, organization, patient);
      await upsertDocumentToFHIRServer(FHIRDocRef);
    }
  } catch (err) {
    console.log(`Error: `, err);
    capture.error(err, {
      extra: {
        context: `cw.queryDocuments`,
        ...(err instanceof CommonwellError ? err.additionalInfo : undefined),
      },
    });
    throw err;
  } finally {
    try {
      await updateDocQueryStatus({ patient, status: "completed" });
    } catch (err) {
      capture.error(err, {
        extra: { context: `cw.getDocuments.updateDocQueryStatus` },
      });
    }
  }
}

async function internalGetDocuments({
  patient,
  organization,
  facility,
}: {
  patient: Patient;
  organization: Organization;
  facility: Facility;
}): Promise<Document[]> {
  const { debug } = Util.out(`CW internalGetDocuments - M patient ${patient.id}`);

  const externalData = patient.data.externalData?.COMMONWELL;
  if (!externalData) return [];
  const cwData = externalData as PatientDataCommonwell;

  const orgName = organization.data.name;
  const orgId = organization.id;
  const facilityNPI = facility.data["npi"] as string; // TODO #414 move to strong type - remove `as string`
  const commonWell = makeCommonWellAPI(orgName, oid(orgId));
  const queryMeta = organizationQueryMeta(orgName, { npi: facilityNPI });

  let docs: DocumentQueryResponse;
  try {
    docs = await commonWell.queryDocuments(queryMeta, cwData.patientId);
    debug(`resp queryDocuments: ${JSON.stringify(docs, null, 2)}`);
  } catch (err) {
    capture.error(err, {
      extra: {
        context: `cw.queryDocuments`,
        cwReference: commonWell.lastReferenceHeader,
        ...(err instanceof CommonwellError ? err.additionalInfo : undefined),
      },
    });
    throw err;
  }

  const documents: Document[] = docs.entry
    ? docs.entry.flatMap(d =>
        d.content?.masterIdentifier?.value && d.content && d.content.location
          ? {
              id: d.content.masterIdentifier.value,
              content: { location: d.content.location, ...d.content },
            }
          : []
      )
    : [];
  return documents;
}

async function dowloadAndUploadDocsToS3({
  patient,
  facilityId,
  documents,
}: {
  patient: Patient;
  facilityId: string;
  documents: Document[];
}): Promise<DocumentWithFilename[]> {
  const uploadStream = (key: string) => {
    const pass = new stream.PassThrough();
    const base64key = Buffer.from(key).toString("base64");

    return {
      writeStream: pass,
      promise: s3client
        .upload({
          Bucket: Config.getMedicalDocumentsBucketName(),
          Key: createS3FileName(patient.cxId, base64key),
          Body: pass,
        })
        .promise(),
    };
  };

  const s3Refs = await Promise.allSettled(
    documents.map(async doc => {
      try {
        if (doc.content?.masterIdentifier?.value) {
          const { writeStream, promise } = uploadStream(doc.content?.masterIdentifier?.value);

          await downloadDocument({
            cxId: patient.cxId,
            patientId: patient.id,
            facilityId: facilityId,
            location: doc.content?.location ? doc.content.location : "",
            stream: writeStream,
          });

          const data = await promise;

          return {
            ...doc,
            content: {
              ...doc.content,
              location: data.Location,
            },
            fileName: data.Key,
          };
        }

        return undefined;
      } catch (error) {
        capture.error(error, {
          extra: {
            context: `s3.documentUpload`,
          },
        });
      }
    })
  );

  const docsNewLocation: DocumentWithFilename[] = s3Refs.flatMap(ref =>
    ref.status === "fulfilled" && ref.value ? ref.value : []
  );

  return docsNewLocation;
}

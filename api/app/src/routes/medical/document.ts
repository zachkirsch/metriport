import { Request, Response } from "express";
import Router from "express-promise-router";
import * as AWS from "aws-sdk";
import status from "http-status";
import { Config } from "../../shared/config";
import { queryDocumentsAcrossHIEs } from "../../command/medical/document/document-query";
import { getDocuments } from "../../external/fhir/document/get-documents";
import { getPatientOrFail } from "../../command/medical/patient/get-patient";
import { asyncHandler, getCxIdOrFail, getFromQuery, getFromQueryOrFail } from "../util";
import { toDTO } from "./dtos/documentDTO";
import { createS3FileName } from "../../shared/external";

const router = Router();

const s3client = new AWS.S3();

/** ---------------------------------------------------------------------------
 * GET /document
 *
 * Queries for all available document metadata for the specified patient across HIEs.
 *
 * @param req.query.patientId Patient ID for which to retrieve document metadata.
 * @param req.query.facilityId The facility providing NPI for the document query.
 * @return The metadata of available documents.
 */
router.get(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    const cxId = getCxIdOrFail(req);
    const patientId = getFromQueryOrFail("patientId", req);
    const facilityId = getFromQueryOrFail("facilityId", req);
    const forceQuery = getFromQuery("force-query", req);

    const documents = await getDocuments(`patient=${patientId}&extension=Commonwell`);
    const documentsDTO = toDTO(documents);

    const queryStatus = forceQuery
      ? await queryDocumentsAcrossHIEs({ cxId, patientId, facilityId })
      : (await getPatientOrFail({ cxId, id: patientId })).data.documentQueryStatus ?? "completed";

    return res.status(status.OK).json({ queryStatus, documents: documentsDTO });
  })
);

/** ---------------------------------------------------------------------------
 * GET /document/query
 *
 * Triggers a document query for the specified patient across HIEs.
 *
 * @param req.query.patientId Patient ID for which to retrieve document metadata.
 * @param req.query.facilityId The facility providing NPI for the document query.
 * @return The status of document querying.
 */
router.post(
  "/query",
  asyncHandler(async (req: Request, res: Response) => {
    const cxId = getCxIdOrFail(req);
    const patientId = getFromQueryOrFail("patientId", req);
    const facilityId = getFromQueryOrFail("facilityId", req);

    const queryStatus = await queryDocumentsAcrossHIEs({ cxId, patientId, facilityId });

    return res.status(status.OK).json({ queryStatus });
  })
);

/** ---------------------------------------------------------------------------
 * GET /downloadUrl
 *
 * Fetches the document from S3 and sends a presigned URL
 *
 * @param req.query.fileName The file name of the document in s3.
 * @return presigned url
 */
router.get(
  "/downloadUrl",
  asyncHandler(async (req: Request, res: Response) => {
    const cxId = getCxIdOrFail(req);
    const seconds = 20;
    const fileName = getFromQueryOrFail("fileName", req);

    const url = s3client.getSignedUrl("getObject", {
      Bucket: Config.getMedicalDocumentsBucketName(),
      Key: createS3FileName(cxId, fileName),
      Expires: seconds,
    });

    return res.status(status.OK).json({ url });
  })
);

export default router;

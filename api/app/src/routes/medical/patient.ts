import { Request, Response } from "express";
import Router from "express-promise-router";
import status from "http-status";
import { createPatient, PatientCreateCmd } from "../../command/medical/patient/create-patient";
import { getPatientOrFail, getPatients } from "../../command/medical/patient/get-patient";
import { deletePatient } from "../../command/medical/patient/delete-patient";
import { PatientUpdateCmd, updatePatient } from "../../command/medical/patient/update-patient";
import { processAsyncError } from "../../errors";
import { toFHIR } from "../../external/fhir/patient";
import { upsertPatientToFHIRServer } from "../../external/fhir/patient/upsert-patient";
import cwCommands from "../../external/commonwell";
import {
  asyncHandler,
  getCxIdOrFail,
  getETag,
  getFromParamsOrFail,
  getFromQueryOrFail,
} from "../util";
import { dtoFromModel } from "./dtos/patientDTO";
import {
  patientCreateSchema,
  patientUpdateSchema,
  schemaCreateToPatient,
  schemaUpdateToPatient,
} from "./schemas/patient";
import { areDocumentsProcessing } from "../../command/medical/document/document-status";

const router = Router();

/** ---------------------------------------------------------------------------
 * POST /patient
 *
 * Creates the patient corresponding to the specified facility at the
 * customer's organization if it doesn't exist already.
 *
 * @param  req.query.facilityId The ID of the Facility the Patient should be associated with.
 * @return The newly created patient.
 */
router.post(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    const cxId = getCxIdOrFail(req);
    const facilityId = getFromQueryOrFail("facilityId", req);
    const payload = patientCreateSchema.parse(req.body);

    const patientCreate: PatientCreateCmd = {
      ...schemaCreateToPatient(payload, cxId),
      facilityId,
    };

    const patient = await createPatient(patientCreate);

    // temp solution until we migrate to FHIR
    const fhirPatient = toFHIR(patient);
    await upsertPatientToFHIRServer(fhirPatient);

    return res.status(status.CREATED).json(dtoFromModel(patient));
  })
);

/** ---------------------------------------------------------------------------
 * PUT /patient/:id
 *
 * Updates the patient corresponding to the specified facility at the customer's organization.
 * Note: this is not a PATCH, so requests must include all patient data in the payload.
 *
 * @param req.query.facilityId The facility providing NPI for the patient update
 * @return The patient to be updated
 */
router.put(
  "/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const cxId = getCxIdOrFail(req);
    const id = getFromParamsOrFail("id", req);
    const facilityId = getFromQueryOrFail("facilityId", req);
    const payload = patientUpdateSchema.parse(req.body);

    const isProcessing = await areDocumentsProcessing({ id, cxId });

    if (isProcessing) {
      return res.status(status.LOCKED).json("Document querying currently in progress");
    }

    const patientUpdate: PatientUpdateCmd = {
      ...schemaUpdateToPatient(payload, cxId),
      ...getETag(req),
      id,
    };
    const updatedPatient = await updatePatient(patientUpdate);

    // temp solution until we migrate to FHIR
    const fhirPatient = toFHIR(updatedPatient);
    await upsertPatientToFHIRServer(fhirPatient);

    // TODO: #393 declarative, event-based integration
    // Intentionally asynchronous - it takes too long to perform
    cwCommands.patient
      .update(updatedPatient, facilityId)
      .catch(processAsyncError(`cw.patient.update`));

    return res.status(status.OK).json(dtoFromModel(updatedPatient));
  })
);

/** ---------------------------------------------------------------------------
 * GET /patient/:id
 *
 * Returns a patient corresponding to the specified facility at the customer's organization.
 *
 * @param   req.cxId      The customer ID.
 * @param   req.param.id  The ID of the patient to be returned is associated with.
 * @return  The customer's patients associated with the given facility.
 */
router.get(
  "/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const cxId = getCxIdOrFail(req);
    const patientId = getFromParamsOrFail("id", req);

    const patient = await getPatientOrFail({ id: patientId, cxId });

    return res.status(status.OK).json(dtoFromModel(patient));
  })
);

/** ---------------------------------------------------------------------------
 * DELETE /patient/:id
 *
 * Deletes a patient from our DB and HIEs.
 *
 * @param req.query.facilityId The facility providing NPI for the patient delete
 * @return 204 No Content
 */
router.delete(
  "/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const cxId = getCxIdOrFail(req);
    const id = getFromParamsOrFail("id", req);
    const facilityId = getFromQueryOrFail("facilityId", req);

    const patientDeleteCmd = {
      ...getETag(req),
      id,
      cxId,
      facilityId,
    };
    await deletePatient(patientDeleteCmd);

    return res.sendStatus(status.NO_CONTENT);
  })
);

/** ---------------------------------------------------------------------------
 * GET /patient
 *
 * Gets all patients corresponding to the specified facility at the customer's organization.
 *
 * @param   req.cxId              The customer ID.
 * @param   req.query.facilityId  The ID of the facility the user patient is associated with.
 * @return  The customer's patients associated with the given facility.
 */
router.get(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    const cxId = getCxIdOrFail(req);
    const facilityId = getFromQueryOrFail("facilityId", req);

    const patients = await getPatients({ cxId, facilityId: facilityId });

    const patientsData = patients.map(dtoFromModel);
    return res.status(status.OK).json({ patients: patientsData });
  })
);

export default router;

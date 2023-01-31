import { StrongId } from "../models/identifier";
import { Organization } from "../models/organization";
import { Patient } from "../models/patient";
import { Person, PersonSearchResp } from "../models/person";

export function getId(object: Person): string | undefined {
  const url = object._links?.self?.href;
  if (!url) return undefined;
  return url.substring(url.lastIndexOf("/") + 1);
}

export function getPersonIdFromSearchByPatientDemo(object: PersonSearchResp): string | undefined {
  if (!object._embedded || !object._embedded.person) return undefined;
  const embeddedPersons = object._embedded.person.filter(p => p.enrolled);
  if (embeddedPersons.length < 1) return undefined;
  if (embeddedPersons.length > 1) {
    console.log(`Found more than one person, using the first one: `, object);
  }
  const person = embeddedPersons[0];
  return getId(person);
}

export function getIdTrailingSlash(object: Patient | Organization): string | undefined {
  const url = object._links?.self?.href;
  if (!url) return undefined;
  const removeTrailingSlash = url.substring(0, url.length - 1);
  return removeTrailingSlash.substring(removeTrailingSlash.lastIndexOf("/") + 1);
}

export function getPatientStrongIds(object: Patient): StrongId[] | undefined {
  return object.identifier;
}

function buildPatiendIdToDocQuery(code: string, system: string): string {
  return `${system}|${code}`;
}

/**
 * Converts the patient ID into subject ID, to be used during document query.
 *
 * @param {string} patientId - The patient's ID
 * @returns {string} - The subject ID as defined by the specification: [system]|[code] where 'system'
 * is the OID of the organization and 'code' is the first (numeric) part of the patient ID.
 *
 * @see {@link https://specification.commonwellalliance.org/services/data-broker/protocol-operations-data-broker#8781-find-documents|API spec}
 */
export function convertPatientIdToSubjectId(patientId: string): string | undefined {
  const value = decodeURIComponent(decodeURI(patientId));
  const regex = /(.+)\^\^\^(.+)/i;
  const match = value.match(regex);
  return match && match.length >= 3 ? buildPatiendIdToDocQuery(match[1], match[2]) : undefined;
}

import { Facility } from "../../../models/medical/facility";
import { BaseDTO, toBaseDTO } from "./baseDTO";
import { LocationAddressDTO } from "./location-address-dto";

export type FacilityDTO = BaseDTO & {
  id: string;
  name: string;
  npi: string;
  tin: string | undefined;
  active: boolean | undefined;
  address: LocationAddressDTO;
};

export function dtoFromModel(facility: Facility): FacilityDTO {
  const { name, npi, tin, active, address } = facility.data;
  return {
    ...toBaseDTO(facility),
    id: facility.id,
    name,
    npi,
    tin,
    active,
    address,
  };
}

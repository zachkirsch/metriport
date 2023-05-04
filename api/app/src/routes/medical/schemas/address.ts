import { z } from "zod";
import { USState } from "../../../shared/geographic-locations";
import { defaultOptionalString, defaultZipString, optionalString } from "./shared";

export const usStateSchema = z.nativeEnum(USState);

export const addressSchema = z.object({
  addressLine1: defaultOptionalString,
  addressLine2: defaultOptionalString,
  city: defaultOptionalString,
  state: usStateSchema.or(defaultOptionalString),
  zip: defaultZipString,
  country: defaultOptionalString.default("USA"), // here for backwards compatibility, we'll ignore this and always default to USA
});

export const locationAddressSchema = z.object({
  addressLine1: z.string().min(1),
  addressLine2: optionalString(z.string()),
  city: z.string().min(1),
  state: usStateSchema,
  zip: defaultZipString,
  country: z.string().min(1).default("USA"),
});

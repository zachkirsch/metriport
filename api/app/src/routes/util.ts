import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import { ApiTypes } from "../command/usage/report-usage";
import BadRequestError from "../errors/bad-request";
import { analytics, EventTypes } from "../shared/analytics";
import { capture } from "../shared/notifications";

export const asyncHandler =
  (
    f: (
      req: Request,
      res: Response,
      next: NextFunction
      //eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) => Promise<Response<any, Record<string, any>> | void>
  ) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      analyzeRoute(req);
      await f(req, res, next);
    } catch (err) {
      console.error(err);
      next(err);
    }
  };

export const analyzeRoute = (req: Request): void => {
  const medicalRoutes = ["medical", "fhir"];
  const devicesRoutes = ["activity", "body", "biometrics", "nutrition", "sleep", "user"];

  let cxId;

  const reqCxId = getCxId(req);
  if (reqCxId) cxId = reqCxId;

  const headerCxId = getCxIdFromHeaders(req);
  if (headerCxId) cxId = headerCxId;

  if (cxId) {
    const isMedical = medicalRoutes.some(route => req.baseUrl.includes(route));
    const isDevices = devicesRoutes.some(route => req.baseUrl.includes(route));

    let reqUrl = req.baseUrl;
    const hasPath = req.route.path.split("/")[1];

    if (hasPath) {
      reqUrl = reqUrl.concat(req.route.path);
    }

    analytics({
      distinctId: cxId,
      event: EventTypes.query,
      properties: {
        method: req.method,
        url: reqUrl,
        ...(isMedical
          ? { apiType: ApiTypes.medical }
          : isDevices
          ? { apiType: ApiTypes.devices }
          : undefined),
      },
    });
  }
};

// https://www.rfc-editor.org/rfc/rfc7807
export type HttpResponseBody = { status: number; title: string; detail?: string };
export const httpResponseBody = ({
  status,
  title,
  detail,
}: {
  status: number;
  title: string;
  detail?: string;
}): HttpResponseBody => {
  return {
    status,
    title,
    detail,
  };
};

export const getFromQuery = (prop: string, req: Request): string | undefined =>
  req.query[prop] as string | undefined;
export const getFromQueryOrFail = (prop: string, req: Request): string => {
  const value = getFromQuery(prop, req);
  if (!value) throw new BadRequestError(`Missing ${prop} query param`);
  return value;
};

export const getFromParams = (prop: string, req: Request): string | undefined =>
  req.params[prop] as string | undefined;
export const getFromParamsOrFail = (prop: string, req: Request): string => {
  const value = getFromParams(prop, req);
  if (!value) throw new BadRequestError(`Missing ${prop} param`);
  return value;
};

export const getFromHeader = (prop: string, req: Request): string | undefined => req.header(prop);
export const getFromHeaderOrFail = (prop: string, req: Request): string => {
  const value = getFromHeader(prop, req);
  if (!value) throw new Error(`Missing ${prop} header`); // Plain Error bc this is app logic, not user error
  return value;
};

export interface GetWithParams {
  optional: (prop: string, req: Request) => string | undefined;
  orFail: (prop: string, req: Request) => string;
}
export interface GetWithoutParams extends GetWithParams {
  optional: () => string | undefined;
  orFail: () => string;
}
export type Context = "query" | "params" | "headers";
export const functionByContext: Record<Context, GetWithParams> = {
  query: {
    optional: getFromQuery,
    orFail: getFromQueryOrFail,
  },
  params: {
    optional: getFromParams,
    orFail: getFromParamsOrFail,
  },
  headers: {
    optional: getFromHeader,
    orFail: getFromHeaderOrFail,
  },
};
export function getFrom(context: Context): GetWithParams {
  return functionByContext[context];
}

export const getCxId = (req: Request): string | undefined => {
  const cxId = req.cxId;
  cxId && capture.setUserId(cxId);
  return cxId;
};
export const getCxIdOrFail = (req: Request): string => {
  const cxId = getCxId(req);
  if (!cxId) throw new BadRequestError("Missing cxId");
  return cxId;
};

export const getCxIdFromQuery = (req: Request): string | undefined => {
  const cxId = req.query.cxId as string | undefined;
  cxId && capture.setUserId(cxId);
  return cxId;
};
export const getCxIdFromQueryOrFail = (req: Request): string => {
  const cxId = getCxIdFromQuery(req);
  if (!cxId) throw new BadRequestError("Missing cxId query param");
  return cxId;
};

export const getCxIdFromHeaders = (req: Request): string | undefined => {
  const cxId = req.header("cxId") as string | undefined;
  cxId && capture.setUserId(cxId);
  return cxId;
};

/** @deprecated use getFromQuery() */
export const getDate = (req: Request): string | undefined => req.query.date as string | undefined;
/** @deprecated use getFromQueryOrFail() */
export const getDateOrFail = (req: Request): string => {
  const date = getDate(req);
  if (!date) throw new BadRequestError("Missing date query param");
  return date as string;
};

export function getETag(req: Request): {
  eTag: string | undefined;
} {
  const eTagHeader = req.header("If-Match");
  const eTagPayload = req.body.eTag;
  return {
    eTag: eTagHeader ?? eTagPayload,
  };
}

export function isHttpOK(statusCode: number): boolean {
  return httpStatus[`${statusCode}_CLASS`] === httpStatus.classes.SUCCESSFUL;
}

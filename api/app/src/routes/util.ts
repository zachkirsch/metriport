import { NextFunction, Request, Response } from "express";
import BadRequestError from "../errors/bad-request";
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
      await f(req, res, next);
    } catch (err) {
      console.error(err);
      next(err);
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

export const getCxId = (req: Request): string | undefined => {
  const cxId = req.cxId;
  capture.setUserId(cxId);
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

export const getUserIdFromHeaders = (req: Request): string | undefined =>
  req.header("userId") as string | undefined;

/** @deprecated use getFromQuery() */
export const getUserId = (req: Request): string | undefined =>
  req.query.userId as string | undefined;
/** @deprecated use getFromQueryOrFail() */
export const getUserIdFromQueryOrFail = (req: Request): string => {
  const userId = getUserId(req);
  if (!userId) throw new BadRequestError("Missing userId query param");
  return userId as string;
};

/** @deprecated use getFromParams() */
export const getUserIdFromParams = (req: Request): string | undefined =>
  req.params.userId as string | undefined;
/** @deprecated use getFromParamsOrFail() */
export const getUserIdFromParamsOrFail = (req: Request): string => {
  const userId = getUserIdFromParams(req);
  if (!userId) throw new BadRequestError("Missing userId param");
  return userId as string;
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

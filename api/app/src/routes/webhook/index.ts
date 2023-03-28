import Router from "express-promise-router";
import garmin from "./garmin";
import apple from "./apple";
import { processAPIKey } from "../middlewares/auth";

const routes = Router();

routes.use("/garmin", garmin);
routes.use("/apple", processAPIKey, apple);

export default routes;

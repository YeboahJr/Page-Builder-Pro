import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import dashboardRouter from "./dashboard";
import casesRouter from "./cases";
import reportsRouter from "./reports";
import patrolsRouter from "./patrols";
import officersRouter from "./officers";
import idChangesRouter from "./idchanges";
import evidenceRouter from "./evidence";
import storageRouter from "./storage";
import { requirePages } from "../middlewares/requirePages";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
// Data routes are gated by the page rights of the page(s) they back
// (officers.allowedPages). Leadership always passes; null = all pages allowed.
// The officers router applies requirePages per-route because it also contains
// self-service endpoints (own password, own avatar, own profile).
router.use("/dashboard", requirePages("dashboard"), dashboardRouter);
router.use("/cases", requirePages("dashboard", "fallmanagement", "archiv"), casesRouter);
router.use("/reports", requirePages("leitstelle"), reportsRouter);
router.use("/patrols", requirePages("leitstelle"), patrolsRouter);
router.use("/officers", officersRouter);
router.use("/idchanges", requirePages("personal"), idChangesRouter);
router.use("/evidence", requirePages("fallmanagement"), evidenceRouter);
router.use(storageRouter);

export default router;

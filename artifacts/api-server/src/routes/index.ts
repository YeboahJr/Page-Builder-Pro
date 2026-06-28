import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import dashboardRouter from "./dashboard";
import casesRouter from "./cases";
import reportsRouter from "./reports";
import patrolsRouter from "./patrols";
import officersRouter from "./officers";
import evidenceRouter from "./evidence";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/dashboard", dashboardRouter);
router.use("/cases", casesRouter);
router.use("/reports", reportsRouter);
router.use("/patrols", patrolsRouter);
router.use("/officers", officersRouter);
router.use("/evidence", evidenceRouter);

export default router;

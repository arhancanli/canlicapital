// api/v1/validate/reality-check.js
import { compute } from "../../../js/validate/reality-check.js";
import { validatorHandler } from "../../_lib/handler.js";

export { compute };

export default validatorHandler({ endpoint: "validate/reality-check", sourcesPaths: ["js/validate/reality-check.js", "js/snooping-core.js", "js/selection-risk-core.js"], compute });

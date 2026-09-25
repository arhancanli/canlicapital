// api/v1/validate/paper-evidence.js
import { compute } from "../../../js/validate/paper-evidence.js";
import { validatorHandler } from "../../_lib/handler.js";

export { compute };

export default validatorHandler({
  endpoint: "validate/paper-evidence",
  sourcesPaths: ["js/validate/paper-evidence.js", "js/paper-evidence-core.js", "standards/paper-evidence/schema.json"],
  compute,
});

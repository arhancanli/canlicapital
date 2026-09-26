// api/v1/validate/overfitting.js
import { compute } from "../../../js/validate/overfitting.js";
import { validatorHandler } from "../../_lib/handler.js";

export { compute };

export default validatorHandler({
  endpoint: "validate/overfitting",
  sourcesPaths: ["js/validate/overfitting.js", "js/pbo-core.js", "js/selection-risk-core.js", "api/_lib/limits.js", "standards/validation-api/vectors.json"],
  compute,
});

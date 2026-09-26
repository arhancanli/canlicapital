// api/v1/validate/deflated-sharpe.js
import { compute } from "../../../js/validate/deflated-sharpe.js";
import { validatorHandler } from "../../_lib/handler.js";

export { compute };

export default validatorHandler({
  endpoint: "validate/deflated-sharpe",
  sourcesPaths: ["js/validate/deflated-sharpe.js", "js/dsr-core.js", "js/moments-core.js", "api/_lib/limits.js", "public/glassbox/deflated_sharpe_calculator_contract.json", "standards/validation-api/vectors.json"],
  compute,
});

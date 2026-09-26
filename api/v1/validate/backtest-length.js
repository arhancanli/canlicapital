// api/v1/validate/backtest-length.js
import { compute } from "../../../js/validate/backtest-length.js";
import { validatorHandler } from "../../_lib/handler.js";

export { compute };

export default validatorHandler({ endpoint: "validate/backtest-length", sourcesPaths: ["js/validate/backtest-length.js", "js/dsr-core.js"], compute });

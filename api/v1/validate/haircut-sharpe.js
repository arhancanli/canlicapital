// api/v1/validate/haircut-sharpe.js
import { compute } from "../../../js/validate/haircut-sharpe.js";
import { validatorHandler } from "../../_lib/handler.js";

export { compute };

export default validatorHandler({ endpoint: "validate/haircut-sharpe", sourcesPaths: ["js/validate/haircut-sharpe.js", "js/haircut-core.js", "js/student-t.js"], compute });

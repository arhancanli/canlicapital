// api/v1/validate/breadth.js
import { compute } from "../../../js/validate/breadth.js";
import { validatorHandler } from "../../_lib/handler.js";

export { compute };

export default validatorHandler({ endpoint: "validate/breadth", sourcesPaths: ["js/validate/breadth.js", "js/breadth-core.js"], compute });

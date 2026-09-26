// api/v1/validate/luck-trials.js
import { compute } from "../../../js/validate/luck-trials.js";
import { validatorHandler } from "../../_lib/handler.js";

export { compute };

export default validatorHandler({ endpoint: "validate/luck-trials", sourcesPaths: ["js/validate/luck-trials.js", "js/luck-core.js", "js/student-t.js", "js/dsr-core.js"], compute });

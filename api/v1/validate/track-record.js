// api/v1/validate/track-record.js
import { compute } from "../../../js/validate/track-record.js";
import { validatorHandler } from "../../_lib/handler.js";

export { compute };

export default validatorHandler({ endpoint: "validate/track-record", sourcesPaths: ["js/validate/track-record.js", "js/dsr-core.js"], compute });

const logger = require('node-color-log');

let verbose;

module.exports.init = (_verbose) => {
    verbose = _verbose;
}

function beautify(data) {
    return JSON.stringify(data, null, 2);
}

module.exports.printError = (err) => {
    if (err && err.response && err.response?.status) {
        let code = err.response.status;
        switch (code) {
            case 401:
            case 403:
                logger.error("Error: Forbidden - unauthorized access");
                logger.error("Is your api key correct?");
                break;
            case 500:
                logger.error("Opps, internal error :(");
                logger.error("Please try again or report it to us, thanks!");
                break;
            case 409:
            case 400:
                logger.error("Bad request!");
                if (err.response.data) {
                    logger.error(beautify(err.response.data));
                }
                break;
            default:
                logger.error("Status code: " + code);
                if (err.response.data) {
                    logger.error(beautify(err.response.data));
                }
                break;
        }
    }else {
        logger.error("Couldn't reach the server!");
        logger.error(err);
    }
}
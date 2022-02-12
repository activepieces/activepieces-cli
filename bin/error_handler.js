let verbose;
module.exports.init = (_verbose) => {
    verbose = _verbose;
}
module.exports.printError = (err) => {
    if (err.response?.status) {
        let code = err.response.status;
        switch (code) {
            case 401:
                console.log("Error: Forbidden - unauthorized access");
                console.log("Is your api key correct?");
                break;
            case 500:
                console.log("Opps, internal error :(");
                console.log("Please try again or report it to us, thanks!");
                break;
            case 400:
                console.log("Bad request!");
                if (err.response.data && !verbose) {
                    console.log(err.response.data);
                }
                break;
        }
    }
    if (verbose){
        console.log(err);
    }
}
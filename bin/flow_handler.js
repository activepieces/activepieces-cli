const prompts = require('prompts');
const fs = require('fs');
const path = require('path');
const logger = require('node-color-log');
const errorHandler = require('./error_handler');
const FormData = require('form-data');
const axios = require('axios');

let verbose;
let host;
let api_key;
let project_id;

module.exports.init = (_verbose, _host, _api_key, _project_id) => {
    verbose = _verbose;
    host = _host;
    api_key = _api_key;
    project_id = _project_id;
    errorHandler.init(_verbose);
}

module.exports.createPiece = async (piece_name) => {
    prompts({
        type: 'select',
        name: 'pieceType',
        message: 'Please select the piece type:',
        choices: [{
            title: 'Integration',
            value: 'INTEGRATION'
        },
            {
                title: 'Connector',
                value: 'CONNECTOR'
            },
        ],
        initial: 0
    }).then(async pieceTypeSelector => {
        let visibility = 'PUBLIC';
        let pieceType = pieceTypeSelector.pieceType;
        if (pieceType === 'CONNECTOR') {
            visibility_selector = await prompts({
                type: 'select',
                name: 'visibility',
                message: 'Please select the visibility:',
                choices: [{
                    title: 'Private',
                    value: 'PRIVATE'
                },
                    {
                        title: 'Public',
                        value: 'PUBLIC'
                    },
                ],
                initial: 0
            });
            visibility = visibility_selector.visibility;
        }
        createPieceHelper(piece_name, visibility, pieceType);
    });
}

module.exports.updatePiece = () => {
    if (fs.existsSync('./piece.json')) {
        let piece = JSON.parse(fs.readFileSync('./piece.json'));
        updatePieceHelper(piece.id, piece.version).then(savedPiece => {
            fs.writeFile(path.join(process.cwd(), "piece.json"), beautify(savedPiece), (err) => {
                if (err) {
                    errorHandler.printError(err);
                }
                logger.info("Piece Updated successfully");
            });
        }).catch(err => {
            errorHandler.printError(err);
        });
    } else {
        errorHandler.printError('Wrong directory, please use command inside piece directory');
    }
}

module.exports.publishPiece = async () => {
    if (fs.existsSync('./piece.json')) {
        let piece = JSON.parse(fs.readFileSync('./piece.json'));
        if (piece.version.state === 'DRAFT') {
            await updatePieceHelper(piece.id, piece.version);
            logger.info("Piece Updated successfully");
        }
        let pieceId = piece.id;
        let config = {
            method: 'post',
            url: host + '/pieces/' + pieceId + '/commit',
            headers: {
                'Authorization': 'Bearer ' + api_key,
            },
        };
        axios(config)
            .then(function (res) {
                let savedPiece = JSON.parse(JSON.stringify(res.data));
                savedPiece.lastVersion = undefined;
                savedPiece.version = res.data.lastVersion;
                fs.writeFile(path.join(process.cwd(), "piece.json"), beautify(savedPiece), (err) => {
                    if (err) {
                        errorHandler.printError(err);
                    }
                    logger.info('Piece published successfully');
                });
            })
            .catch(function (err) {
                errorHandler.printError(err);
            });
    } else {
        logger.error("Wrong directory, please use command inside piece directory");
    }
}

module.exports.deployPiece = async (environment_name) => {
    if (!fs.existsSync('./piece.json')) {
        logger.error("Wrong directory, please use command inside piece directory");
    }else {
        let piece = JSON.parse(fs.readFileSync('./piece.json'));
        let latestVersion = piece.version.id;
        if(piece.version.state === 'DRAFT'){
            latestVersion = piece.versionsList.at(-2);
        }
        getEnvironmentId(environment_name).then((environment) => {
            let found = false;
            environment.deployedPieces.forEach(pieceItem => {
                if (pieceItem.pieceId === piece.id) {
                    found = true;
                    pieceItem.pieceVersionsId = [latestVersion];
                }
            });
            if (!found) {
                environment.deployedPieces.push({
                    "pieceId": piece.id,
                    "pieceVersionsId": [latestVersion]
                });
            }

            const config = {
                method: 'put',
                url: host + '/environments/' + environment.id,
                headers: {
                    'Authorization': 'Bearer ' + api_key
                },
                data: environment
            };

            axios(config).then((res) => {
                logger.info("Piece deployed successfully to the environment " + environment_name);
                if (verbose) {
                    logger.info(beautify(res.data));
                }
            }).catch((err) => {
                errorHandler.printError(err);
            });
        }).catch(err => {
            errorHandler.printError(err);
        });
    }
}

function getEnvironmentId(environment_name) {
    return new Promise((resolve, reject) => {
        const config = {
            method: 'get',
            url: host + '/projects/' + project_id + '/environments/' + environment_name,
            headers: {
                'Authorization': 'Bearer ' + api_key
            },
        };
        axios(config).then((res) => {
            resolve(res.data);
        }).catch((err) => {
            reject(err);
        });
    });

}

function createPieceHelper(piece_name, visibility, piece_type) {
    if (!fs.existsSync('./project.json')) {
        logger.error("Wrong directory, please use command inside project directory");
    } else {
        const piece = {
            "name": piece_name,
            "type": piece_type,
            "visibility": visibility,
            "version": {
                "dependencies": [],
                "configs": [],
                "description": "Short description about piece",
                "displayName": piece_name,
                "flowsVersionId": []
            }
        };

        createPiece(piece).then(savedPiece => {
            fs.mkdir(path.join(process.cwd(), piece_name), (err) => {
                if (err) {
                    errorHandler.printError(err);
                } else {
                    fs.writeFile(path.join(process.cwd(), piece_name, "piece.json"), beautify(savedPiece), (err) => {
                        if (err) {
                            errorHandler.printError(err);
                        }
                        logger.info("Piece Created successfully");
                    });
                }
            });
            if (verbose) {
                logger.info(beautify(savedPiece));
            }
        }).catch(err => {
            errorHandler.printError(err);
        });
    }
}

function updatePieceHelper(piece_id, request_data) {
    return new Promise((resolve, reject) => {
        const bodyFormData = new FormData();
        bodyFormData.append('piece', JSON.stringify(request_data), {
            contentType: 'application/json'
        });
        if (fs.existsSync("logo.jpg")) {
            bodyFormData.append("logo", fs.createReadStream("logo.jpg"));
        }
        const config = {
            method: 'put',
            url: host + '/pieces/' + piece_id,
            headers: {
                'Authorization': 'Bearer ' + api_key,
                ...bodyFormData.getHeaders()
            },
            data: bodyFormData
        };

        axios(config)
            .then(function (res) {
                let savedPiece = JSON.parse(JSON.stringify(res.data));
                savedPiece.lastVersion = undefined;
                savedPiece.version = res.data.lastVersion;
                resolve(savedPiece);
            }).catch(function (err) {
            reject(err);
        });
    });
}

function createPiece(request_data) {
    return new Promise((resolve, reject) => {
        const bodyFormData = new FormData();
        bodyFormData.append('piece', JSON.stringify(request_data), {
            contentType: 'application/json'
        });
        const config = {
            method: 'post',
            url: host + '/projects/' + project_id + '/pieces',
            headers: {
                'Authorization': 'Bearer ' + api_key,
                ...bodyFormData.getHeaders()
            },
            data: bodyFormData
        };

        axios(config)
            .then(function (res) {
                let savedPiece = JSON.parse(JSON.stringify(res.data));
                savedPiece.lastVersion = undefined;
                savedPiece.version = res.data.lastVersion;
                resolve(savedPiece);
            }).catch(function (err) {
            reject(err);
        });
    });
}


function beautify(data) {
    return JSON.stringify(data, null, 2);
}
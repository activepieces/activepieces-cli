#!/usr/bin/env node
const yargs = require('yargs');
const fs = require('fs');
const path = require('path');
const environment = require("./environment");
const FormData = require('form-data');
const axios = require('axios');
var child_process = require('child_process');
const AdmZip = require('adm-zip');
const flowConverter = require('./flow_converter');
const errorHandler = require('./error_handler');
var findup = require('findup-sync');
const prompts = require('prompts');
const logger = require('node-color-log');

const AutoUpdate = require('cli-autoupdate');
let pkg = require('../package.json');
const {log} = require("node-color-log");
const update = new AutoUpdate(pkg);

let project = {};
let argv;
let functionToExec;
let functionInput;
let needProjectData = true
let host;

function parseInputCommand() {
    argv = yargs
        .command('piece <pice_action>', 'Piece commands', (yargs) => {
            return yargs
                .command('create <piece_name>', 'Creates default templates for a piece', () => {
                }, (argv) => {
                    functionToExec = createPiece;
                    functionInput = argv.piece_name;
                })
                .command('publish', 'Publish piece to activepieces', () => {
                }, () => {
                    functionToExec = publishPieceWrapper;
                })
                .command('deploy <environment>', 'Deploy piece to environment', () => {
                }, (argv) => {
                    functionToExec = deployPiece;
                    functionInput = argv.environment;
                })


        })
        .command('flow <flow_action>', 'Flow commands', (yargs) => {
            return yargs
                .command('create <flow_name>', 'Creates default template for a flow', () => {
                }, (argv) => {
                    functionToExec = createFlow;
                    functionInput = argv.flow_name;
                })
                .command('update', 'Updates current version of flow - saves changes', () => {
                }, () => {
                    functionToExec = updateFlow;
                })
                .command('commit', 'Commits current version of flow ', () => {
                }, () => {
                    functionToExec = commitFlow;
                })
        })
        .command('project init', 'Initialize project', () =>{
            needProjectData = false;
            functionToExec = projectInit;
        })
        .option('verbose', {
            alias: 'v',
            type: 'boolean',
            description: 'Run with verbose logging'
        })
        .option('local', {
            alias: 'l',
            type: 'boolean',
            description: "Run on local environment"
        })
        .option('staging', {
            alias: 's',
            type: 'boolean',
            description: "Run on staging environment"
        })
        .strictCommands()
        .alias('help', 'h')
        .parse()
}

function getProjectData() {
    let filepath = findup('project.json');
    if (filepath) {
        let rawdata = fs.readFileSync(filepath);
        project = JSON.parse(rawdata);
    }else{
        logger.error('Wrong directory, Please use command inside project directory');
        process.exit();
    }
}

function beautify(data) {
    return JSON.stringify(data, null, 2);
}

function getHost() {
    if(argv.staging){
        host = environment.staging_host;
    }else if (argv.local) {
        host = environment.local_host;
    } else {
        host = environment.production_host;
    }
}

function setup() {
    update.on('finish', () => {
        parseInputCommand();
        errorHandler.init(argv.verbose);
        getHost();
        if(needProjectData){
           getProjectData();
        }
        functionToExec(functionInput);
    });
}
setup();



function projectInit() {
    prompts({
        type: 'text',
        name: 'api_key',
        message: 'Please enter your api key:',
        validate: api_key => api_key.length > 0
    }).then(input => {
        const config = {
            method: 'get',
            url: host + '/api-keys/' + input.api_key,
            headers: {
                'Authorization': 'Bearer ' + input.api_key
            }
        };

        axios(config).then((res) => {
            let data = {
                "apiKey": res.data.secret,
                "projectId": res.data.projectId,
            }
            fs.writeFile('./project.json', JSON.stringify(data, null, 2), function writeJSON(err) {
                if (err) {
                    logger.error(err);
                }
                logger.info("Project created successfully");
            });
        }).catch((err) => {
            errorHandler.printError(err);
        });
    });
}

function publishPieceRequest(piece) {
    const bodyFormData = new FormData();
    bodyFormData.append('piece', JSON.stringify(piece.version), {contentType: 'application/json'});
    if (fs.existsSync("logo.jpg")) {
        bodyFormData.append("logo", fs.createReadStream("logo.jpg"));
    }
    return new Promise( (resolve, reject) => {
        const config = {
            method: 'put',
            url: host + '/pieces/' + piece.pieceId,
            headers: {
                'Authorization': 'Bearer ' + project.apiKey,
                ...bodyFormData.getHeaders()
            },
            data: bodyFormData
        };

        axios(config)
            .then(function (res) {
                resolve(res);
            }).catch(function (err) {
            reject(err);
        });
    });
}

function publishPiece() {
    return new Promise((resolve, reject) => {
        if (fs.existsSync('./piece.json')) {
            let rawdata = fs.readFileSync('./piece.json');
            let piece = JSON.parse(rawdata);

            const config = {
                method: 'get',
                url: host + '/pieces/' + piece.pieceId + '/flows',
                headers: {
                    'Authorization': 'Bearer ' + project.apiKey
                }
            };
            let flowsVersionId = [];
            axios(config)
                .then(function (res) {
                    res.data.data.forEach(flow => {
                        flowsVersionId.push(flow.versionsList.at(-1));
                    });
                    piece.version.flowsVersionId = flowsVersionId;

                    publishPieceRequest(piece).then(function (publishPieceResponse) {
                        fs.writeFile('./piece.json', JSON.stringify(piece, null, 2), function writeJSON(err) {
                            if (err) {
                                logger.error(err);
                            }
                        });
                        resolve(publishPieceResponse);
                    }).catch((err) => {
                        reject(err);
                    });
                }).catch(err => {
                reject(err);
            });
        } else {
            reject('Wrong directory, please use command inside piece directory');
        }
    });
}

function publishPieceWrapper() {
    publishPiece().then(res => {
        logger.info("Piece published successfully");
        if (argv.verbose) {
            logger.info(beautify(res.data));
        }
    }).catch(err => {
        errorHandler.printError(err);
    });
}

function getEnvironmentId(environment_name) {
    return new Promise((resolve, reject) => {
        const config = {
            method: 'get',
            url: host+'/projects/' + project.projectId + '/environments/' + environment_name,
            headers: {
                'Authorization': 'Bearer ' + project.apiKey
            },
        };
        axios(config).then((res) => {
            resolve(res.data);
        }).catch((err) => {
            reject(err);
        });
    });

}

function getPieceData(pieceId) {
    return new Promise((resolve, reject) => {
        if (fs.existsSync('./piece.json')) {
            let rawdata = fs.readFileSync('./piece.json');
            let piece = JSON.parse(rawdata);

            const config = {
                method: 'get',
                url: host + '/pieces/' + piece.pieceId ,
                headers: {
                    'Authorization': 'Bearer ' + project.apiKey
                }
            };

            axios(config).then((res) => {
                resolve(res);
            }).catch((err) => {
                reject(err);
            });

        }else {
            reject('Wrong directory, please use command inside piece directory');
        }
    });
}

function deployPiece(environment_name) {
    getPieceData().then(res => {
        let latestVersion = res.data.versionsList.at(-1);
        getEnvironmentId(environment_name).then((environment) => {
            let found = false;
            environment.deployedPieces.forEach(piece => {
                if (piece.pieceId === res.data.id) {
                    found = true;
                    piece.pieceVersionsId = [latestVersion];
                }
            });

            if (!found) {
                environment.deployedPieces.push({
                    "pieceId": res.data.id,
                    "pieceVersionsId": [latestVersion]
                });
            }

            const config = {
                method: 'put',
                url: host + '/environments/' + environment.id,
                headers: {
                    'Authorization': 'Bearer ' + project.apiKey
                },
                data: environment
            };

            axios(config).then((res) => {
                logger.info("Piece published successfully to environment " + environment_name);
                if (argv.verbose) {
                    logger.info(beautify(res.data));
                }
            }).catch((err) => {
                errorHandler.printError(err);
            });
        }).catch(err => {
            errorHandler.printError(err);
        });

    }).catch(err => {
        errorHandler.printError(err);
    });

}

function createPiece(piece_name) {
    prompts({
        type: 'select',
        name: 'pieceType',
        message: 'Please select the piece type:',
        choices: [
            {title: 'Integration', value: 'INTEGRATION'},
            {title: 'Connector', value: 'CONNECTOR'},
        ],
        initial: 0
    }).then(piece_type => {
        prompts({
            type: 'select',
            name: 'visibility',
            message: 'Please select the visibility:',
            choices: [
                {title: 'Private', value: 'PRIVATE'},
                {title: 'Public', value: 'PUBLIC'},
            ],
            initial: 0
        }).then(visibility => {
            var data = {
                "name": piece_name,
                "type": piece_type.pieceType,
                "visibility": visibility.visibility,
                "version": {
                    "description": piece_name + " piece description",
                    "displayName": piece_name,
                    "flowsVersionId": []
                }
            }
            const bodyFormData = new FormData();
            bodyFormData.append('piece', JSON.stringify(data), {contentType: 'application/json'});
            if (fs.existsSync("logo.jpg")) {
                bodyFormData.append("logo", fs.createReadStream("logo.jpg"));
            }
            const config = {
                method: 'post',
                url: host + '/projects/' + project.projectId + '/pieces',
                headers: {
                    'Authorization': 'Bearer ' + project.apiKey,
                    ...bodyFormData.getHeaders()
                },
                data: bodyFormData
            };

            axios(config)
                .then(function (res) {
                    fs.mkdir(path.join(process.cwd(), piece_name), (err) => {
                        if (err) {
                            return logger.error(err);
                        }
                        data.pieceId = res.data.id;
                        fs.writeFile(path.join(process.cwd(), piece_name, "piece.json"), JSON.stringify(data, null, 2), (err) => {
                                if (err) return logger.error(err);
                                logger.info('Piece created successfully!');
                            }
                        );
                    });
                })
                .catch(function (err) {
                    errorHandler.printError(err);
                });
        });
    });
}


function createFlow(flow_name) {
    if (fs.existsSync('./piece.json')) {

        let rawdata = fs.readFileSync('./piece.json');
        const piece = JSON.parse(rawdata);
        let data = {
            "name": flow_name,
            "version": {
                "displayName": flow_name,
                "description": flow_name + "flow description",
                "actions": [],
                "configs": [],
                "output": {}
            }
        };
        const bodyFormData = new FormData();
        bodyFormData.append('flow', JSON.stringify(data), {contentType: 'application/json'});
        const config = {
            method: 'post',
            url: host + '/pieces/' + piece.pieceId + '/flows',
            headers: {
                'Authorization': 'Bearer ' + project.apiKey,
                ...bodyFormData.getHeaders()
            },
            data: bodyFormData
        };

        axios(config)
            .then(function (res) {
                fs.mkdir(path.join(process.cwd(), flow_name), (err) => {
                    if (err) {
                        return logger.error(err);
                    }
                    let writtenData = data.version;
                    writtenData.flowId = res.data.id;
                    writtenData.name = data.name;
                    writtenData.trigger = {};
                    fs.writeFile(path.join(process.cwd(), flow_name, "flow.json"), JSON.stringify(writtenData, null, 2), (err) => {
                            if (err) return logger.error(err);
                            logger.info('Flow created successfully!');
                        }
                    );
                });
            })
            .catch(function (err) {
                errorHandler.printError(err);
            });
    } else {
        logger.error("Wrong directory, please use command inside piece directory");
    }
}

function getFlowData(flow) {
    const bodyFormData = new FormData();
    if (fs.existsSync('./code')) {
        let files = fs.readdirSync(path.join(process.cwd(), 'code'));
        files.forEach((file) => {
            const filePath = path.join(process.cwd(), 'code', file);
            const stat = fs.statSync(filePath);
            if (stat && stat.isDirectory()) {
                child_process.execSync('npm install', {
                    cwd: filePath
                });
                zip = new AdmZip();
                zip.addLocalFolder(filePath, file);
                bodyFormData.append('artifacts', zip.toBuffer(), file + '.zip');
            }
        });
    }
    try {
        let convertedFlow = flowConverter.convertFlowJSON(flow);
        bodyFormData.append('flow', JSON.stringify(convertedFlow), {contentType: 'application/json'});
        return bodyFormData;

    } catch (err) {
        logger.error(err);
        return null;
    }
}

function updateFlow() {
    if (fs.existsSync('./flow.json')) {

        let flow = JSON.parse(fs.readFileSync('./flow.json'));
        const flowData = getFlowData(flow);
        if (!flowData)
            return;
        const config = {
            method: 'put',
            url: host + '/flows/' + flow.flowId + '/versions/latest',
            headers: {
                'Authorization': 'Bearer ' + project.apiKey,
                ...flowData.getHeaders()
            },
            maxContentLength: 100000000,
            maxBodyLength: 1000000000,
            data: flowData
        };

        axios(config)
            .then(function (res) {
                logger.info("Flow updated successfully");
                if(argv.verbose) {
                    logger.info(beatify(res.data));
                }

            })
            .catch(function (err) {
                if(err.response?.data?.errorCode === 'flow_version_locked') {
                    if (argv.verbose) {
                        logger.debug('flow version locked, cloning flow..');
                    }
                    cloneFlow(flow.flowId,   true);
                } else {
                    errorHandler.printError(err);
                }
            });

    } else {
        logger.error("Wrong directory, please use command inside flow directory");
    }
}

function cloneFlow(flowId, callUpdateFlow) {
    let config = {
        method: 'post',
        url: host + '/flows/' + flowId + '/versions/latest/clone',
        headers: {
            'Authorization': 'Bearer ' + project.apiKey,
        },
    };
    axios(config)
        .then(function () {
            if (callUpdateFlow)
                updateFlow();
        }).catch((err) => {
        errorHandler.printError(err);
    });
}

function commitFlow(flowId) {
    if (flowId || fs.existsSync('./flow.json')) {
        let flow = fs.existsSync('./flow.json') ? JSON.parse(fs.readFileSync('./flow.json')).flowId : flowId;
        let config = {
            method: 'put',
            url: host + '/flows/' + flow + '/commit',
            headers: {
                'Authorization': 'Bearer ' + project.apiKey,
            },
        };

        axios(config)
            .then(function (res) {
                logger.info('Flow committed successfully');
                cloneFlow(flow);
                return res.data.versionsList.at(-1).id;
            })
            .catch(function (err) {
                if (!flowId) {
                    errorHandler.printError(err);
                }
                return null;
            });
    }
    else{
        logger.error("Wrong directory, please use command inside flow directory");
    }
}


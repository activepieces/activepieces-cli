#!/usr/bin/env node
const yargs = require('yargs');
const fs = require('fs');
const path = require('path');
const {host} = require("./environment");
const FormData = require('form-data');
const axios = require('axios');
var child_process = require('child_process');
const AdmZip = require('adm-zip');
const flowConverter = require('./flow_converter');
const errorHandler = require('./error_handler');
var findup = require('findup-sync');
const prompts = require('prompts');

const AutoUpdate = require('cli-autoupdate');
let pkg = require('../package.json');
const update = new AutoUpdate(pkg);

let project = {};
let argv;
let functionToExec;
let functionInput;
let needProjectData = true

function parseInputCommand() {
    argv = yargs
        .command('piece <pice_action>', 'Piece commands', (yargs) => {
            return yargs
                .command('create <piece_name>', 'Creates default templates for a piece', () => {
                }, (argv) => {
                    functionToExec = createPiece;
                    functionInput = argv.piece_name;
                })
                .command('update', 'Commits all changes piece', () => {
                }, () => {
                    functionToExec = updatePieceWrapper;
                })
                .command('publish <environment>', 'Push piece to environment', () => {
                }, (argv) => {
                    functionToExec = publishPiece;
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
        console.log('Wrong directory, Please use command inside project directory');
        process.exit();
    }
}

function setup() {
    update.on('finish', () => {
        parseInputCommand();
        errorHandler.init(argv.verbose);

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
                    console.log(err);
                }
                console.log("Project created successfully");
            });
        }).catch((err) => {
            errorHandler.printError(err);
        });

    });
}

function updatePieceRequest(piece) {

    return new Promise( (resolve, reject) => {
        const config = {
            method: 'put',
            url: host + '/pieces/' + piece.pieceId,
            headers: {
                'Authorization': 'Bearer ' + project.apiKey
            },
            data: piece.version
        };

        axios(config)
            .then(function (res) {
                resolve(res);
            }).catch(function (err) {
            reject(err);
        });
    });
}

function updatePiece() {
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
                        flowsVersionId.push(flow.versionsList.at(-1).id);
                    });
                    piece.version.flowsVersionId = flowsVersionId;

                    updatePieceRequest(piece).then(function (updatePieceResponse) {
                        fs.writeFile('./piece.json', JSON.stringify(piece, null, 2), function writeJSON(err) {
                            if (err) {
                                console.log(err);
                            }
                        });
                        resolve(updatePieceResponse);
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

function updatePieceWrapper() {
    updatePiece().then(res => {
        console.log("Piece updated successfully");
        if (argv.verbose) {
            console.log(JSON.stringify(res.data));
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
function publishPiece(environment_name) {
    updatePiece().then(res => {
        let latestVersion = res.data.versionsList.at(-1).id;
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
                url: host+'/environments/' + environment.id,
                headers: {
                    'Authorization': 'Bearer ' + project.apiKey
                },
                data: environment
            };

            axios(config).then((res) => {
                console.log("Piece published successfully to environment " + environment_name);
                if (argv.verbose) {
                    console.log(JSON.stringify(res.data));
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

    var data = {
        "pieceType": "INTEGRATION",
        "version": {
            "name": piece_name,
            "description": piece_name + " piece description",
            "displayName": piece_name,
            "pieceType": "INTEGRATION",
            "flowsVersionId": []
        }
    }
    const config = {
        method: 'post',
        url: host+'/projects/' + project.projectId + '/pieces',
        headers: {
            'Authorization': 'Bearer ' + project.apiKey
        },
        data: data
    };

    axios(config)
        .then(function (res) {
            fs.mkdir(path.join(process.cwd(), piece_name), (err) => {
                if (err) {
                    return console.error(err);
                }
                data.pieceId = res.data.id;
                fs.writeFile(path.join(process.cwd(), piece_name, "piece.json"), JSON.stringify(data, null, 2), (err) => {
                        if (err) return console.error(err);
                        console.log('Piece created successfully!');
                    }
                );
            });
        })
        .catch(function (err) {
            errorHandler.printError(err);
        });
}
function createFlow(flow_name) {
    if (fs.existsSync('./piece.json')) {

        let rawdata = fs.readFileSync('./piece.json');
        const piece = JSON.parse(rawdata);
        let data = {
            "name": flow_name,
            "displayName": flow_name,
            "description": flow_name + "flow description",
            "actions": [],
            "variables": [],
        };
        const bodyFormData = new FormData();
        bodyFormData.append('flow', JSON.stringify(data), {contentType: 'application/json'});
        // bodyFormData.append('artifacts', []);
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
                        return console.error(err);
                    }
                    data.flowId = res.data.id;
                    data.trigger = {};
                    fs.writeFile(path.join(process.cwd(), flow_name, "flow.json"), JSON.stringify(data, null, 2), (err) => {
                            if (err) return console.log(err);
                            console.log('Flow created successfully!');
                        }
                    );
                });
            })
            .catch(function (err) {
                errorHandler.printError(err);
            });
    }else {
        console.log("Wrong directory, please use command inside piece directory");
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
                bodyFormData.append('artifacts',zip.toBuffer(),file+'.zip');
            }
        });
    }

    let convertedFlow = flowConverter.convertFlowJSON(flow);
    bodyFormData.append('flow', JSON.stringify(convertedFlow), {contentType: 'application/json'});

    return bodyFormData;
}

function updateFlow() {
    if (fs.existsSync('./flow.json')) {

        let flow = JSON.parse(fs.readFileSync('./flow.json'));
        const flowData = getFlowData(flow);

        const config = {
            method: 'put',
            url: host + '/flows/' + flow.flowId + '/versions/latest',
            headers: {
                'Authorization': 'Bearer ' + project.apiKey,
                ...flowData.getHeaders()
            },
            data: flowData
        };

        axios(config)
            .then(function (res) {
                console.log("Flow updated successfully");
                if(argv.verbose) {
                    console.log(JSON.stringify(res.data));
                }

            })
            .catch(function (err) {

                if(err.response.data.errorCode === 'flow_version_locked') {
                    if (argv.verbose) {
                        console.log('flow version locked, cloning flow..');
                    }
                    cloneFlow(flow.flowId,   true);
                } else {
                    errorHandler.printError(err);
                }
            });

    } else {
        console.log("Wrong directory, please use command inside flow directory");
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
                if (argv.verbose) {
                    console.log('Flow committed successfully');
                }
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
        console.log("Wrong directory, please use command inside flow directory");
    }
}


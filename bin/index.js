#!/usr/bin/env node
const yargs = require('yargs');
const fs = require('fs');
const path = require('path');
const environment = require("./environment");
const FormData = require('form-data');
const axios = require('axios');
const child_process = require('child_process');
const AdmZip = require('adm-zip');
const flowConverter = require('./flow_converter');
const errorHandler = require('./error_handler');
const pieceHandler = require('./piece_handler');
const flowHandler = require('./flow_handler');
const findup = require('findup-sync');
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
                .command('update', 'Update piece to activepieces', () => {
                }, () => {
                    functionToExec = updatePiece;
                })
                .command('publish', 'Publish piece to activepieces', () => {
                }, () => {
                    functionToExec = publishPiece;
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
        .command('project init', 'Initialize project', () => {
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
    } else {
        logger.error('Wrong directory, Please use command inside project directory');
        process.exit();
    }
}

function beautify(data) {
    return JSON.stringify(data, null, 2);
}

function getHost() {
    if (argv.staging) {
        host = environment.staging_host;
    } else if (argv.local) {
        host = environment.local_host;
    } else {
        host = environment.production_host;
    }
}

function setup() {
    update.on('finish', async () => {
        parseInputCommand();
        errorHandler.init(argv.verbose);
        getHost();
        if (needProjectData) {
            getProjectData();
        }
        pieceHandler.init(argv.verbose, host, project.apiKey, project.projectId);
        flowHandler.init(argv.verbose, host, project.apiKey, project.projectId);
        await functionToExec(functionInput);
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

function deployPiece(environment_name) {
    pieceHandler.deployPiece(environment_name);
}

async function createPiece(piece_name) {
    await pieceHandler.createPiece(piece_name);
}

function updatePiece() {
    pieceHandler.updatePiece();
}

function publishPiece() {
    pieceHandler.publishPiece();
}

function createFlow(flow_name) {
    flowHandler.createFlow(flow_name);
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
                if (argv.verbose) {
                    logger.info(beatify(res.data));
                }

            })
            .catch(function (err) {
                if (err.response?.data?.errorCode === 'flow_version_locked') {
                    if (argv.verbose) {
                        logger.debug('flow version locked, cloning flow..');
                    }
                    cloneFlow(flow.flowId, true);
                } else {
                    errorHandler.printError(err);
                }
            });

    } else {
        logger.error("Wrong directory, please use command inside flow directory");
    }
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
                return res.data.versionsList.at(-1).id;
            })
            .catch(function (err) {
                if (!flowId) {
                    errorHandler.printError(err);
                }
                return null;
            });
    } else {
        logger.error("Wrong directory, please use command inside flow directory");
    }
}


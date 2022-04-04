const prompts = require('prompts');
const fs = require('fs');
const path = require('path');
const logger = require('node-color-log');
const errorHandler = require('./error_handler');
const FormData = require('form-data');
const axios = require('axios');
const AdmZip = require("adm-zip");
const flowConverter = require("./flow_converter");
const child_process = require('child_process');

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

module.exports.createFlow = (flow_name) => {
    if (fs.existsSync('./piece.json')) {
        const piece = JSON.parse(fs.readFileSync('./piece.json'));
        let flowData = {
            "name": flow_name,
            "version": {
                "displayName": flow_name,
                "description": flow_name + "flow description",
                "actions": [],
                "configs": [],
                "output": {},
                "access": 'PRIVATE'
            }
        };
        const bodyFormData = new FormData();
        bodyFormData.append('flow', JSON.stringify(flowData), {contentType: 'application/json'});
        const config = {
            method: 'post',
            url: host + '/pieces/' + piece.id + '/flows',
            headers: {
                'Authorization': 'Bearer ' + api_key,
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
                    let writtenData = restructFlow(res.data);
                    fs.writeFile(path.join(process.cwd(), flow_name, "flow.json"), beautify(writtenData), (err) => {
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

function getFlowData(flowVersion, flow_path) {
    const bodyFormData = new FormData();
    if (fs.existsSync(path.join(flow_path, 'code'))) {
        let files = fs.readdirSync(path.join(flow_path, 'code'));
        files.forEach((file) => {
            const filePath = path.join(flow_path, 'code', file);
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
        let convertedFlowVersion = flowConverter.convertFlowJSON(flowVersion);
        bodyFormData.append('flow', JSON.stringify(convertedFlowVersion), {contentType: 'application/json'});
        return bodyFormData;

    } catch (err) {
        logger.error(err);
        return null;
    }
}


module.exports.updateFlow = (flow_path) => {
    return new Promise((resolve, reject) => {
        try {
            if (fs.existsSync(path.join(flow_path, 'flow.json'))) {
                let flow = JSON.parse(fs.readFileSync(path.join(flow_path, 'flow.json')));
                const flowData = getFlowData(flow.version, flow_path);
                if (!flowData) {
                    reject();
                }
                const config = {
                    method: 'put',
                    url: host + '/flows/' + flow.id + '/versions/latest',
                    headers: {
                        'Authorization': 'Bearer ' + api_key,
                        ...flowData.getHeaders()
                    },
                    maxContentLength: 100000000,
                    maxBodyLength: 1000000000,
                    data: flowData
                };

                axios(config)
                    .then(function (res) {
                        logger.info(flow.name + " flow updated successfully");
                        if (verbose) {
                            logger.info(beautify(res.data));
                        }
                        resolve(res);
                    })
                    .catch(function (err) {
                        reject(err);
                    });

            } else {
                reject(flow.name + "missing flow.json file");
            }
        } catch(e) {
            reject(e);
        }
    });
}

module.exports.createCodeAction = (action_name)=>{
    if (fs.existsSync('flow.json')) {
        try {
            let flow = JSON.parse(fs.readFileSync('flow.json'));
            if (!fs.existsSync('./code')) {
                fs.mkdirSync(path.join(process.cwd(), 'code'));
            }
            createCodeActionFolder(action_name);
            flow.version.actions.push({
                name: action_name,
                type: "CODE",
                displayName: action_name,
                settings: {
                    artifact: action_name + ".zip",
                    input: {}
                }
            });
            fs.writeFileSync('./flow.json', beautify(flow));
            logger.info('Code action created successfully!');
        }catch(err) {
            if(err.code == "EEXIST") {
                return logger.error(`Code action ${action_name} already exists`);
            }
            return logger.error(err);
        }
    }else {
        logger.error("Wrong directory, please use command inside flow directory");
    }
}

function createCodeActionFolder(action_name) {

    fs.mkdirSync(path.join(process.cwd(), 'code', action_name));
    let writtenData = 'exports.codePiece = async (context) => {};'
    fs.writeFileSync(path.join(process.cwd(), 'code', action_name, 'index.js'), writtenData);
    writtenData = {};
    writtenData.dependencies = {};
    fs.writeFileSync(path.join(process.cwd(), 'code', action_name, 'package.json'), beautify(writtenData));
}

function restructFlow(flow){
    let writtenData = JSON.parse(JSON.stringify(flow));
    writtenData.lastVersion = undefined
    writtenData.epochCreationTime = undefined;
    writtenData.epochUpdateTime = undefined;
    writtenData.archived = undefined;

    writtenData.version = flow.lastVersion;
    writtenData.version.flowId = undefined;
    writtenData.version.epochCreationTime = undefined;
    writtenData.version.epochUpdateTime = undefined;
    writtenData.version.trigger = {};
    return writtenData;
}

function beautify(data) {
    return JSON.stringify(data, null, 2);
}
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
                "output": {}
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
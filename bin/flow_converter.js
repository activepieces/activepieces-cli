const Validator = require('jsonschema').Validator;

const actionSchema = {
    "type": "object",
    "properties": {
        "type": { "enum": ["CODE", "CONDITION"] },
        "name": {"type": "string"},
        "nextAction": {"type": "string"},
        "onSuccessAction": {"type": "string"},
        "onFailureAction": {"type": "string"},
        "commonAction": {"type": "string"}
    },
    "allOf": [
        {
            "required": ["type", "name"]
        },
        {
            "if": {
                "properties": {
                    "type": {"const": "CONDITION"}
                },
            },
            "then": {
                "properties": {
                    "nextAction": false
                },
            }
        },
        {
            "if": {
                "properties": {
                    "type": {"const": "CODE"}
                },
            },
            "then": {
                "properties": {
                    "onSuccessAction": false,
                    "onFailureAction": false,
                    "commonAction": false
                },
            }
        },
    ]
}
let triggerSchema = {
    "type": "object",
    "properties": {
        "type": { "enum": ["EVENT"] },
        "nextAction": {"type": "string"},
    },

}
let v = new Validator();

module.exports.convertFlowJSON = (flow) => {
    let newFlow = {};
    newFlow.displayName = flow.displayName;
    newFlow.description = flow.description;
    newFlow.name = flow.name;
    newFlow.variables = flow.variables;
    if(!flow.trigger) {
        throw 'Error in flow.json format - trigger is required';
    }
    newFlow.trigger =  convertFlowActions(flow.trigger,flow.actions, "trigger");
   return newFlow;
}

function convertFlowActions(curState, actions, type) {

    if(type === "trigger" ){
        if(!v.validate(curState, triggerSchema).valid) {
            throw 'Error in flow.json format - trigger schema';
        }
    }
    if(type === "action" ){
        if(!v.validate(curState, actionSchema).valid) {
            throw 'Error in flow.json format - actions schema';
        }
    }

    if(curState.hasOwnProperty('nextAction')) {
        let found = false;
        actions.forEach(action => {
            if (action.name === curState.nextAction) {
                curState.nextAction = convertFlowActions(action,actions,"action");
                found = true;
            }
        });
        if (!found){
            throw 'no action with name ' + curState.nextAction;
        }
    }
    if(curState.hasOwnProperty('onSuccessAction')) {
        let found = false;
        actions.forEach(action => {
            if (action.name === curState.onSuccessAction) {
                curState.onSuccessAction = convertFlowActions(action,actions,"action");
                found = true;
            }
        });
        if (!found){
            throw 'no action with name ' + curState.onSuccessAction;
        }
    }
    if(curState.hasOwnProperty('onFailureAction')) {
        let found = false;
        actions.forEach(action => {
            if (action.name === curState.onFailureAction) {
                curState.onFailureAction = convertFlowActions(action,actions,"action");
                found = true;
            }
        });
        if (!found){
            throw 'no action with name ' + curState.onFailureAction;
        }
    }
    if(curState.hasOwnProperty('commonAction')) {
        let found = false;
        actions.forEach(action => {
            if (action.name === curState.commonAction) {
                curState.commonAction = convertFlowActions(action,actions,"action");
                found = true;
            }
        });
        if (!found){
            throw 'no action with name ' + curState.commonAction;
        }
    }
    return curState;
}


function validateFlow() {
    let rawdata = fs.readFileSync('./testflow.json');
    const flow = JSON.parse(rawdata);
    try {
        const data = flowConverter.convertFlowJSON(flow);
        fs.writeFile(path.join(process.cwd(), "result.json"), JSON.stringify(data, null, 2), (err) => {
                if (err) return console.error(err);
                console.log('flow created successfully!');
            }
        );
    }catch (e) {
        console.log(e);
    }
}


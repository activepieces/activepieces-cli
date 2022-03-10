const {action} = require("prompts/lib/util");
module.exports.convertFlowJSON = (flow) => {
    let newFlow = JSON.parse(JSON.stringify(flow));
    if (!checkUniqueActionNames(flow.actions)) {
        throw 'Error in flow.json format - action names must be unique';
    }
    newFlow.action = undefined;
    if(!flow.trigger) {
        throw 'Error in flow.json format - trigger is required';
    }
    newFlow.trigger =  convertFlowActions(flow.trigger,flow.actions, "trigger");

   return newFlow;
}

function checkUniqueActionNames(actions) {
    let s = new Set();
    actions.forEach(action => {
       if(s.has(action.name))
           return false;
       s.add(action.name);
    });
    return true;
}

function convertFlowActions(curState, actions, type) {

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
    if(curState.hasOwnProperty('settings')) {
        let settings = curState.settings;
        if(settings.hasOwnProperty("branches")) {

            for(let i = 0; i < settings.branches.length;++i){

                if(settings.branches[i].hasOwnProperty("nextAction")){
                    let actionName = settings.branches[i].nextAction;

                    let found = false;
                    actions.forEach(action => {
                        if (action.name === actionName) {
                            settings.branches[i].nextAction = convertFlowActions(action, actions, "action");
                            found = true;
                        }
                    });
                    if (!found) {
                        throw 'no action with name ' + actionName;
                    }
                }
            }
        }
    }
    return curState;
}




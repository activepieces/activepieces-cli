module.exports.convertFlowJSON = (flow) => {
    let newFlow = JSON.parse(JSON.stringify(flow));
    newFlow.action = undefined;
    if(!flow.trigger) {
        throw 'Error in flow.json format - trigger is required';
    }
    newFlow.trigger =  convertFlowActions(flow.trigger,flow.actions, "trigger");
   return newFlow;
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


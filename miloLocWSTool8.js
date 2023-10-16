class MiloLocWSTool {
    wsApi=`/ws-api/v2`;
    defTransitionId = 124246;
    token = 0;
    projectsLimit=10000;
    segmentsLimit=10000;
    numParallel = 8;

    constructor(token,{ host } = {}) {
        this.token = token;
        if (host) {
            this.wsApi=`https://${host}/ws-api/v2`;
        }
    }

    wsLog = {
        info: (...args) => {
            console.log(args);
        },
        debug: (...args) => {
            console.log(args);
        }    
    }

    setToken(tkn) {
        this.token=tkn;
    }

    async getProjects(pname) {
        let projs = [];
        if (pname?.length < 5) {
            this.wsLog.info('Too Shortname');
            return projs;
        }
        let reqUrl = `${this.wsApi}/projectGroups/search?fields=id,name,projects(id,name)offset=0&limit=${this.projectsLimit}&viewMode=5&token=${this.token}`;
        this.wsLog.info(reqUrl);
        let pgResp = await fetch(reqUrl, {
            method: "POST",
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({"operator":"and","filters":[{"field":"projects(name)","value":pname,"operator":"like"}]})
        });
        if (!pgResp.ok) {
            this.wsLog.info(`Error while getting projects ${pgResp.status}`);
        } else {
            let pgRespJson = await pgResp.json();
            this.wsLog.debug(`Projects: ${JSON.stringify(pgRespJson)}`);
            pgRespJson?.items.forEach((e) => {
                e.projects?.forEach((p) => {
                    projs.push(p.id);
                })
            });
        }
        this.wsLog.info(`Projects ${JSON.stringify(projs)}`);
        return projs;
    }

    async getProjectDetails(pids) {
        let taskIds = []
        for(var c1=0; c1 < pids.length; c1++) {
            let pid = pids[c1];
            let reqUrl = `${this.wsApi}/projects/${pid}?token=${this.token}&fields=id,name,status,targetLocale(name),tasks(id,status)`;
            let pdResp = await fetch(reqUrl);
            if (!pdResp.ok) {
                this.wsLog.info(`Error while getting project details ${pdResp.status} for ${reqUrl}`);
            } else {
                let pdRespJson = await pdResp.json();
                this.wsLog.debug(`Projects ${JSON.stringify(pdRespJson)}`);
                if (pdRespJson.status === 'ACTIVE') {
                    pdRespJson.tasks?.forEach((t) => {
                        taskIds.push(t.id);
                    });
                }
            }
        };
        this.wsLog.info(`Task Ids ${JSON.stringify(taskIds)}`);
        return taskIds;
    }

    async getCompleteTransitionId(tid) {
        let transitionId = this.defTransitionId;
        let reqUrl = `${this.wsApi}/tasks/${tid}?token=${this.token}`;
        let sResp = await fetch(reqUrl);
        if (!sResp.ok) {
            this.wsLog.info(`Error while getting task details ${sResp.status} for ${reqUrl}`);
        } else {
            const taskDtls = await sResp.json();
            this.wsLog.info(`Current step ${JSON.stringify(taskDtls.currentTaskStep)}`);
            const stepId = taskDtls.currentTaskStep?.id;
            const translateOpts = taskDtls.steps?.find((e) => e.id === stepId);
            const completeTransition = translateOpts?.workflowTransitions.find((e) => e.text === 'Complete');
            transitionId = completeTransition?.id;
            this.wsLog.info(`Complete Transition Id - ${transitionId}`);
        }
        return transitionId;
    }

    async claimTask(tid) {
        var cids = []
        cids.push({id:tid});
        let reqUrl = `${this.wsApi}/tasks/claim?token=${this.token}`;
        let sResp = await fetch(reqUrl, {
            method: "POST",
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(cids)
        });
        this.wsLog.info(`Claim tasks ${JSON.stringify(cids)} is ${sResp.ok} ${sResp.status}`);
    }

    async updateFragments(tid, i) {
        let updUrl = `${this.wsApi}/segments?token=${this.token}&taskId=${tid}`;
        console.debug(`Updating segments for ${i.tag}`);
        i.status = [
            "MANUAL_TRANSLATION",
            "PENDING",
            "SEGMENT_CHANGED_BY_HUMAN_CURRENT"
        ];
        i.target = i.source;
        this.wsLog.info(i);
        return fetch(updUrl,{
            method: "POST",
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify([i])
        })
        .then(e => e.ok ? e.json() : e)
        .then(e => this.wsLog.debug(`Update results ${i.tag} and ${e.status}`))
        .catch(err => this.wsLog.info(`Unable failed update for ${i.tag} ${err?.status} ${err?.message} `))
    }

    async copyTargetAndComplete(tids) {
        if (tids && tids.length) {
            await this.getCompleteTransitionId(tids[0]);
        }
        for(var c1=0; c1 < tids.length; c1++) {
            let tid = tids[c1];
            let reqUrl = `${this.wsApi}/segments?token=${this.token}&taskId=${tid}&limit=${this.segmentsLimit}`;
            let sResp = await fetch(reqUrl);
            if (!sResp.ok) {
                this.wsLog.info(`Error while getting fragment details ${sResp.status} for ${reqUrl}`);
            } else {
                await this.claimTask(tid);
                this.wsLog.info(`Updating task ${c1} / ${tids.length}`);
                let sRespJson = await sResp.json();
                const segments = sRespJson.items?.filter((i) => i.type == "TEXT");
                const numSegs = segments?.length;
                let segArr = [];
                while (segments.length) {
                    let promiseArr = [];
                    for(var ctr = 0; ctr < this.numParallel && segments.length; ctr++) {
                        promiseArr.push(this.updateFragments(tid, segments.pop()));
                    }
                    await Promise.all(promiseArr);
                };
                // Mark Task Complete
                await this.taskComplete(tid);
            }
        };
        this.wsLog.info('Updated segments');
    }

    async taskComplete(tid) {
        var cids = []
        const transitionId = await this.getCompleteTransitionId(tid);
        cids.push({id:tid, "transitionId": transitionId || this.defTransitionId, comment: 'Complete tasks from automated api.'});
        let reqUrl = `${this.wsApi}/tasks/complete?token=${this.token}`;
        let sResp = await fetch(reqUrl, {
            method: "POST",
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(cids)
        });
        this.wsLog.info(`Complete tasks ${JSON.stringify(cids)} is ${sResp.ok} ${sResp.status}`);
    }

    async wsUpdate(pname) {
        var pids = await this.getProjects(pname);
        var tids = await this.getProjectDetails(pids);
        await this.copyTargetAndComplete(tids);
    }
}

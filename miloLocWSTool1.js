class MiloLocWSTool {
    wsApi=`/ws-api/v2`;
    transitionId = 124246;
    token = 0;

    constructor(token,{ host }) {
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
            false && console.log(args);
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
        let reqUrl = `${this.wsApi}/projectGroups/search?fields=id,name,projects(id,name)offset=0&limit=100&viewMode=5&token=${this.token}`;
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

    async claimTask(tid) {
        var cids = []
        cids.push({id:tids[c1]});
        let reqUrl = `${this.wsApi}/tasks/claim?token=${this.token}`;
        let sResp = await fetch(reqUrl, {
            method: "POST",
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(cids)
        });
        this.wsLog.info(`Claim tasks ${JSON.stringify(cids)} is ${sResp.ok} ${sResp.status}`);
    }

    async copyTargetAndComplete(tids) {
        for(var c1=0; c1 < tids.length; c1++) {
            let tid = tids[c1];
            let reqUrl = `${this.wsApi}/segments?token=${this.token}&taskId=${tid}`;
            let sResp = await fetch(reqUrl);
            if (!sResp.ok) {
                this.wsLog.info(`Error while getting fragment details ${sResp.status} for ${reqUrl}`);
            } else {
                this.claimTask(tid);
                this.wsLog.info(`Updating task ${c1} / ${tids.length} segments`);
                let sRespJson = await sResp.json();
                for(var c2=0; c2 < sRespJson.items?.length; c2++) {
                    let i = sRespJson.items[c2];
                    if (i.type == "TEXT") {
                        let updUrl = `${this.wsApi}/segments?token=${this.token}&taskId=${tid}`;
                        console.debug(`Updating segments ${c2} / ${sRespJson.items.length} for ${i.tag}`);
                        i.status = [
                            "MANUAL_TRANSLATION",
                            "PENDING",
                            "SEGMENT_CHANGED_BY_HUMAN_CURRENT"
                        ];
                        i.target = i.source;
                        this.wsLog.info(i);
                        let sUpdResp = await fetch(updUrl,{
                            method: "POST",
                            headers: {'Content-Type': 'application/json'},
                            body: JSON.stringify([i])
                        });
                        if (!sUpdResp.ok) {
                            this.wsLog.info(`Unable failed update for ${i.tag}`);
                        } else {
                            let sUpdRespJson = await sUpdResp.json();
                            this.wsLog.debug(`Updated ${i.tag} and ${sUpdRespJson.status}`);
                        }
                    }
                };
                // Mark Task Complete
                this.taskComplete(tid);
            }
        };
        this.wsLog.info('Updated segments');
    }

    async taskComplete(tid) {
        var cids = []
        cids.push({id:tid, "transitionId": this.transitionId, comment: 'Complete tasks from automated api.'});
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

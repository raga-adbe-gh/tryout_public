class MiloLocWSTool {
    wsApi=`/ws-api/v2`;
    wsWbApi=`/ws-legacy//browser_workbench`;
    defTransitionId = 124246;
    token = 0;
    projectsLimit=10000;
    segmentsLimit=10000;
    segGroup = 5;
    numParallel = 8;
    numParallelTasks = 4; // For legacy


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
        },
        error: (...args) => {
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
            // this.wsLog.debug(`Projects: ${JSON.stringify(pgRespJson)}`);
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
                // this.wsLog.debug(`Projects ${JSON.stringify(pdRespJson)}`);
                if (pdRespJson.status === 'ACTIVE') {
                    pdRespJson.tasks?.forEach((t) => {
                        if ( t.status?.status !== 'SUCCEEDED') {
                            taskIds.push(t.id);
                        }
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
            // this.wsLog.info(`Current step ${JSON.stringify(taskDtls.currentTaskStep)}`);
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

    async updateSegmentByApi(tid, iArr) {
        let updUrl = `${this.wsApi}/segments?token=${this.token}&taskId=${tid}`;
        iArr.forEach ((i) => {
            i.status = [
                "MANUAL_TRANSLATION",
                "PENDING",
                "SEGMENT_CHANGED_BY_HUMAN_CURRENT"
            ];
            i.target = i.source;
        });
        return fetch(updUrl,{
            method: "POST",
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(iArr)
        })
        .then(e => e.ok ? e.json() : e)
        .then(e => this.wsLog.debug(`Update results ${iArr} and ${e.status}`))
        .catch(err => this.wsLog.info(`Unable failed update for ${iArr} ${err?.status} ${err?.message} `))
    }

    async updateSegmentsByApi(tid, segs) {
        let segments = [...segs];
        let segArr = [];
        while (segments?.length) {
            let arr = [];
            for(var ctr = 0; ctr < this.segGroup && segments.length; ctr++) {
                arr.push(segments.pop());
            }
            segArr.push(arr);
        }
        while (segArr?.length) {
            let promiseArr = [];
            for(var ctr = 0; ctr < this.numParallel && segArr.length; ctr++) {
                var segs = segArr.pop();
                this.wsLog.info(`Updating segments ${JSON.stringify(segs)}`);
                promiseArr.push(this.updateSegmentByApi(tid, segs));
            }
            await Promise.all(promiseArr);
        };
    }

    async updateSegmentsByLegacy(tid, segs) {
        try {
            if (!segs?.length) return null;
            const getDocId = `${this.wsWbApi}?token=${this.token}&mode=tasks`;
            const docIdHtml = await fetch(getDocId, {
                "headers": {
                    "accept": "*/*",
                    "content-type": "application/x-www-form-urlencoded",
                },
                "body": `viewMode=12&checkbox=${tid}`,
                "method": "POST",
            }).then((e) => e.ok ? e.text() : e.status);
            const docIdRe = new RegExp('docId=([0-9]*)');
            const randomRe = new RegExp('random=([0-9]*)');
            let docId = 0;
            let randomId = 0;
            try {
                docId = docIdHtml.match(docIdRe)[1];
                randomId = docIdHtml.match(randomRe)[1];
            } catch(err) {
                this.wsLog.error(`Failed to extract docId or random id for ${tid} with ${err} and html ${docIdHtml}`);
                return null;
            }

            const updDoc = `${this.wsWbApi}?token=${this.token}&mode=tasks&random=${randomId}`;
            var urlencoded = new URLSearchParams();
            urlencoded.append("task_id", tid);
            urlencoded.append("segs_on_screen_first", "0");
            urlencoded.append("segs_on_screen_size", ""+this.segmentsLimit);
            urlencoded.append("segs_on_screen_textonly", "true");
            urlencoded.append("segs_on_screen_boundary", "false");
            urlencoded.append("segs_on_screen_mask", "0");
            let segments = [...segs];
            while (segments?.length) {
                var seg = segments.pop();
                urlencoded.append(`src_segment_${seg.tag}`, seg.source);
                urlencoded.append(`tgt_segment_${seg.tag}`, seg.source);
                urlencoded.append(`tgt_segment_${seg.tag}_changed`, "1");
            }
            urlencoded.append("doc_on_screen", docId);
            urlencoded.append("submittedBy", "save");
            urlencoded.append("methodUsed", "POST");
            const saveResp = await fetch(updDoc, {
                "headers": {
                    "accept": "*/*",
                    "content-type": "application/x-www-form-urlencoded",
                },
                "body": urlencoded,
                "method": "POST"
            }).then((e) => e.text());
            if (saveResp?.includes('error_details')) {
                this.wsLog.info(`There is possibly an error ${saveResp}`);
            }
        } catch(err) {
            this.wsLog.error(`!! Error while updating segment ${tid} - ${err?.message}`);
        }
    }

    async updateTask(tid) {
        let reqUrl = `${this.wsApi}/segments?token=${this.token}&taskId=${tid}&limit=${this.segmentsLimit}`;
        let sResp = await fetch(reqUrl);
        if (!sResp.ok) {
            this.wsLog.info(`Error while getting fragment details ${sResp.status} for ${reqUrl}`);
        } else {
            // Skipping claim to check if it still works good
            // await this.claimTask(tid);
            let sRespJson = await sResp.json();
            // this.wsLog.info(sRespJson.items);
            const segments = sRespJson.items?.filter((i) => i.type == "TEXT" && i.source && (!i.target || !i.status?.includes('FINISHED')));
            const numSegs = segments?.length;
            this.wsLog.info(`Segments to process ${numSegs}`);
            if (numSegs) {
                await this.updateSegmentsByLegacy(tid, segments);
            }

            // Mark Task Complete
            await this.taskComplete(tid);
        }
    }

    async copyTargetAndComplete(taskIds) {
        const numTids = taskIds?.length;
        if (!numTids) return;
        let tids = [...taskIds];
        while (tids.length) {
            let promiseArr = [];
            for(var ctr = 0; ctr < this.numParallelTasks && numTids; ctr++) {
                var tid = tids.pop();
                promiseArr.push(this.updateTask(tid));
            }
            this.wsLog.info(`Updating tasks ${tids.length} / ${numTids}`);
            await Promise.all(promiseArr);
        };
        this.wsLog.info('Updated tasks');
    }

    async taskComplete(tid) {
        var cids = []
        const transitionId = await this.getCompleteTransitionId(tid);
        cids.push({id:tid, "transitionId": transitionId || this.defTransitionId, comment: 'Complete tasks from automated api.'});
        let reqUrl = `${this.wsApi}/tasks/complete?token=${this.token}&recalculateAutoError=false`;
        let sResp = await fetch(reqUrl, {
            method: "POST",
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(cids)
        });
        this.wsLog.info(`Complete tasks ${JSON.stringify(cids)} is ${sResp.ok} ${sResp.status}`);
    }

    async wsUpdate(pname) {
        const startTime = performance.now();
        var pids = await this.getProjects(pname);
        var tids = await this.getProjectDetails(pids);
        await this.copyTargetAndComplete(tids);
        const endTime = performance.now();

        console.log('Time taken {} mins', (endTime-startTime)/1000/60);
    }
}

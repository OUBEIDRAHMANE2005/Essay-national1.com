function DetectImage() {
    Model.detect(canvas).then(Predictions => {    
        var s = (canvas.width>canvas.height)?canvas.width:canvas.height;
        var objectCount = 0;
        var coveragePercent = 0;
        var shouldStop = false;
        var targetObj = null;
        var maxArea = 0;
        var obstacleDetected = false;
        var currentTime = Date.now();
        
        // Threshold settings
        const BOTTLE_STOP_THRESHOLD = 0.10;
        const BOTTLE_PULSE_THRESHOLD = 0.05;
        const PERSON_STOP_THRESHOLD = 0.50;
        const PERSON_REDUCE_THRESHOLD = 0.30;
        const STOP_SIGN_THRESHOLD = 0.50;
        const CENTER_THRESHOLD = 0.2;
        const PULSE_INTERVAL = 500;
        
        var currentSpeed = 186;
        var isCentered = false;

        if (Predictions.length>0) {
            result.innerHTML = "";
            coverage.innerHTML = "";
            
            // Find largest detection of current selected object class
            Predictions.forEach(function(d) {
                var area = (d.bbox[2] * d.bbox[3]);
                
                if ((object.value == "bottle" || object.value == "cell phone") && d.class == object.value && area > maxArea) {
                    maxArea = area;
                    targetObj = d;
                }
                else if (object.value == "person") {
                    if (d.class == object.value && area > maxArea) {
                        maxArea = area;
                        targetObj = d;
                    }
                    else if ((d.class == "bottle" || d.class == "cell phone" || d.class == "stop sign") && area > maxArea) {
                        maxArea = area;
                        targetObj = d;
                    }
                }
            });
            
            // Check if previous obstacle is now gone
            if (message.innerHTML.includes("STOPPED") && !targetObj) {
                object.value = "person";
                note.innerHTML = "Currently tracking: person";
                message.innerHTML = "RESUMING PERSON TRACKING";
                currentSpeed = 186;
                setTimeout(() => { message.innerHTML = ""; }, 100);
            }
            
            if (targetObj) {
                const x = targetObj.bbox[0];
                const y = targetObj.bbox[1];
                const width = targetObj.bbox[2];
                const height = targetObj.bbox[3];
                
                // Calculate coverage percentage
                var objectArea = width * height;
                var imageArea = canvas.width * canvas.height;
                coveragePercent = (objectArea / imageArea);
                coverage.innerHTML = "Frame coverage: " + Math.round(coveragePercent*100) + "%";
                
                var midX = x + width/2;
                isCentered = Math.abs(midX - canvas.width/2) < (canvas.width * CENTER_THRESHOLD);
                
                // Draw detection box
                context.lineWidth = Math.round(s/200);
                context.strokeStyle = targetObj.class == "person" ? "#00FF00" : 
                                    (targetObj.class == "stop sign" ? "#FF0000" : "#00FFFF");
                context.beginPath();
                context.rect(x, y, width, height);
                context.stroke(); 
                
                context.lineWidth = "3";
                context.fillStyle = targetObj.class == "person" ? "#00FF00" : 
                                  (targetObj.class == "stop sign" ? "#FF0000" : "#00FFFF");
                context.font = Math.round(s/20) + "px Arial";
                context.fillText(targetObj.class + " " + Math.round(coveragePercent*100) + "%", x, y-(s/40));
               
                result.innerHTML = targetObj.class + ", " + Math.round(targetObj.score*100) + "%, " + 
                                  Math.round(x) + ", " + Math.round(y) + ", " + 
                                  Math.round(width) + ", " + Math.round(height);

                // Speed control logic
                if (targetObj.class == "stop sign" && coveragePercent >= STOP_SIGN_THRESHOLD) {
                    currentSpeed = 0;
                    shouldStop = true;
                    message.innerHTML = "STOP SIGN DETECTED - FULL STOP";
                }
                else if ((targetObj.class == "bottle" || targetObj.class == "cell phone")) {
                    if (coveragePercent >= BOTTLE_STOP_THRESHOLD) {
                        currentSpeed = 0;
                        shouldStop = true;
                        message.innerHTML = targetObj.class.toUpperCase() + " REACHED - SWITCHING TO PERSON";
                        object.value = "person";
                        note.innerHTML = "Currently tracking: person";
                        setTimeout(() => { 
                            message.innerHTML = "SEARCHING FOR PERSON";
                            currentSpeed = 186;
                        }, 1000);
                    }
                    else if (coveragePercent > BOTTLE_PULSE_THRESHOLD) {
                        var pulseCycle = Math.floor(currentTime / PULSE_INTERVAL) % 2;
                        currentSpeed = pulseCycle === 0 ? 255 : 0;
                        message.innerHTML = targetObj.class.toUpperCase() + " APPROACHING - PULSING";
                    }
                    else {
                        currentSpeed = 186;
                    }
                }
                else if (targetObj.class == "person") {
                    if (coveragePercent > PERSON_REDUCE_THRESHOLD) {
                        currentSpeed = 186 * (1 - (coveragePercent - PERSON_REDUCE_THRESHOLD) / 
                                     (PERSON_STOP_THRESHOLD - PERSON_REDUCE_THRESHOLD));
                        if (coveragePercent >= PERSON_STOP_THRESHOLD) {
                            currentSpeed = 0;
                        }
                    } else {
                        currentSpeed = 186;
                    }
                }
                
                // Update motor speeds
                car('/control?var=speedL&val=' + currentSpeed);
                car('/control?var=speedR&val=' + currentSpeed);
                note.innerHTML = "Tracking: " + targetObj.class + " | Speed: " + Math.round(currentSpeed*100/186) + "%";
                
                // Motor control logic
                if (motorState.checked && !shouldStop) {
                    if (isCentered) {
                        car(currentSpeed > 0 ? '/control?car=1' : '/control?car=3');
                    } 
                    else if (midX < canvas.width/2) {
                        car(!hmirror.checked ? '/control?car=6;' + turnDelayMin.value : '/control?car=7;' + turnDelayMin.value);
                        lastDirection = "left";
                    }
                    else {
                        car(!hmirror.checked ? '/control?car=7;' + turnDelayMin.value : '/control?car=6;' + turnDelayMin.value);
                        lastDirection = "right";
                    }
                }
                
                if (shouldStop) {
                    car('/control?car=3');
                }
                
                objectCount++;
                nobodycount = 0;
            }
        }
        else {
            result.innerHTML = "Unrecognizable";
            coverage.innerHTML = "";
            nobodycount++;
            
            // NEW AUTO-SEARCH FOR SELECTED BOTTLE/CELL PHONE
            if ((object.value == "bottle" || object.value == "cell phone") && motorState.checked) {
                currentSpeed = 186;
                car('/control?var=speedL&val=' + currentSpeed);
                car('/control?var=speedR&val=' + currentSpeed);
                
                if (autodetect.checked && nobodycount>=3) {
                    car(lastDirection == "right" ? 
                        '/control?car=4;' + turnFarDelayMin.value : 
                        '/control?car=2;' + turnFarDelayMin.value);
                }
                message.innerHTML = "SEARCHING " + object.value.toUpperCase();
            }
            // END OF NEW CODE
            
            else if (message.innerHTML.includes("STOPPED")) {
                object.value = "person";
                note.innerHTML = "Currently tracking: person";
                message.innerHTML = "RESUMING PERSON TRACKING";
                currentSpeed = 186;
                setTimeout(() => { message.innerHTML = ""; }, 100);
            }
            
            else if (motorState.checked) {
                currentSpeed = 186;
                car('/control?var=speedL&val=' + currentSpeed);
                car('/control?var=speedR&val=' + currentSpeed);
                
                if (autodetect.checked && nobodycount>=3) {
                    car(lastDirection == "right" ? 
                        '/control?car=4;' + turnFarDelayMin.value : 
                        '/control?car=2;' + turnFarDelayMin.value);
                }
            }
        }
        
        setTimeout(function(){aiStill.click();},150);
    });
}
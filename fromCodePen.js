/*

    File Name:          PS_Timesheet_Enhanced_Bookmarklet.js
    Version:            0.1
    Author:             Edward Sluder (FCA)
    
    Purpose:            Add convenience for the user by auto-populating input fields
                        with saved default times and to accurately show currently 
                        available PTO, as well as projecting future PTO up to three years.

*/

// We'll wrap our whole bookmarklet in an immediately invoked function to
// prevent variable/function names collisions with the main document's code.
(function(){
'use strict';
    
    
// All of the elements we want to manipulate are contained within an iframe.
// We will cache a reference to this iframe's document in the init() function.
let ourFrame;
    
// Check localStorage for user saved options.
let useDarkMode = localStorage.getItem('useDarkMode');
let goFullscreen = localStorage.getItem('goFullscreen');
    
///////////////////////////////////////////////////////////////////////////
///////////////////////////////  Functions  ///////////////////////////////
    
    
//////////////////////////////////////////////////////////////////////////////
/////////////////////  MutationObserver init   ///////////////////////////////

function singleUseObserver(element, callback) {
    console.log('singleUseObserver called');
    let options = {
        childList: true,
        subtree: true
    },
    observer = new MutationObserver( ()=> {        
        observer.disconnect();
        console.log('event.currentTarget (called by)' );
        callback();
    });

    observer.observe(element, options);
}
    
    
function continuousObserver(element, callback) {
    console.log('continuousObserver called');
    let options = {
        attributes: true,
        childList: true,
        subtree: true      
    },
    observer = new MutationObserver( (mutations)=> {  
        // Update our reference to the iframe content.
        let ourFrame = document.querySelector('#ptifrmtgtframe').contentDocument; 
        //
        if ( !ourFrame.querySelector('#iframeStyle') ) {
            injectStyles();
        }
        
        if ( !ourFrame.querySelector('#darkModeStyle') && useDarkMode === 'true' ) {
            darkMode();
        }
        

        
        callback(mutations);
    });

    observer.observe(element, options);
}    


//////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////    

 
    
    
function autoFillClicked() {
    // Get a reference to the content iframe.
    let ourFrame = document.querySelector('#ptifrmtgtframe').contentDocument;
    
    // Get the current value of the viewSelected select element.
    let currentViewSelected = ourFrame.querySelector("#DERIVED_TL_WEEK_VIEW_BY_LIST");
    
    // Get reference to all of the inputs used for filling in time worked. (Quantity will change depending on view selected.)
    let timeInputs = ourFrame.querySelectorAll('input[name^="QTY_DAY"]'); 
    
    // Get reference to all of the Time Reporting Codes (trc) used for filling in time worked. (Quantity will change depending on view selected.)
    let trc = ourFrame.querySelectorAll('select[id^="TRC"]'); 
    
    // Get reference to all User Field 3 fields
    let userField3 = ourFrame.querySelectorAll('input[id^="USER_FIELD_3"]');
    
    // Get localStorage values
    let veiwSelectedIndex = JSON.parse(localStorage.getItem('veiwSelectedIndex'));
    let timeInputsArray = JSON.parse(localStorage.getItem('timeInputsArray'));
    let trcArray = JSON.parse(localStorage.getItem('trcArray'));
    let userField3Array = JSON.parse(localStorage.getItem('userField3Array'));
    
    
    function populateTimeInputs() { 
        // Update our element references.
        timeInputs = ourFrame.querySelectorAll('input[name^="QTY_DAY"]'); 
        let trc = ourFrame.querySelectorAll('select[id^="TRC"]');  
        let userField3 = ourFrame.querySelectorAll('input[id^="USER_FIELD_3"]');
        console.log('userfield3 length:', userField3.length);
        
        // Fill all timeInputs with the saved schedule from localStorage.
        console.log('next step, fill in timeInputs.');
        for (let i = 0; i < timeInputsArray.length; i++) {
            timeInputs[i].value = timeInputsArray[i];
        }
        
        // Fill all trc values (time reporting codes)
        for (let i = 0; i < trcArray.length; i++) {
            trc[i].selectedIndex = trcArray[i];
        }
        
        // Fill all userField3 fields with saved values
        for (let i = 0; i < userField3Array.length; i++) {
            userField3[i].value = userField3Array[i];
        }
        
        
        
    }    

    
    function timeInputsCheck() {
        console.log('afterTimeInputsCheck() ran');
        timeInputs = ourFrame.querySelectorAll('input[name^="QTY_DAY"]');
        if (timeInputs.length !== timeInputsArray.length) {
            afterViewCheck();     
        }
        else {
            console.log('needed timeInput rows acheived');
            populateTimeInputs();
            
        }
    }
    
    
    function afterViewCheck() {
        // update our reference to the content iframe.
        ourFrame = document.querySelector('#ptifrmtgtframe').contentDocument; 
        
        // Check to see if we have the needed number of rows in order to fill in the default worked hours.
        timeInputs = ourFrame.querySelectorAll('input[name^="QTY_DAY"]');
        if (timeInputs.length < timeInputsArray.length) {            
            let addIt = ourFrame.querySelectorAll('a[name ^="ADD_PB"]');
            addIt.forEach( function(i){
                i.addEventListener('click', function() {
                    singleUseObserver(document.querySelector('#ptifrmtgtframe').contentDocument, afterViewCheck)
                });
                
            });
            addIt[addIt.length - 1].click();   
            
        }
        else {
            console.log('timeInputs do match');
            populateTimeInputs();
        }
    } 
    
    
    // First we will check if we are currently on the same view as the saved value.
    if (currentViewSelected.selectedIndex != veiwSelectedIndex) {
        singleUseObserver(ourFrame, afterViewCheck); 
        
        // Change the current view to the saved one and dispatch a change event to trigger an xhr update.
        currentViewSelected.selectedIndex = veiwSelectedIndex;
        currentViewSelected.dispatchEvent(new Event('change'));        
    }
    else {
        afterViewCheck();
    }

  
    
} // End autoFillClicked()

    

function ptoChanged(mutations) {
// We will expand upon the existing "Leave and Compensatory Time Balances" section.
// We will add projected accumulation dates and amounts for Vacation, Personal, and
// Sick days.  
    
    // Update ourFrame reference.
    ourFrame = document.querySelector('#ptifrmtgtframe').contentDocument;
    
    // Test the src of the img to see if PTO is expanded or collapsed.
    let pto = ourFrame.querySelector("#TL_COMPLEAV_TBL\\$expand\\$0 > img").src;
    let ptoExpanded = 'https://hr.gmis.in.gov/cs/hrprd/cache/PT_COLLAPSE_1.GIF';
    if (pto === ptoExpanded) {
        
        // Gather all the PTO data points required to calculate future PTO
        let sick = Number( ourFrame.querySelector('span[id="DERIVED_TL_COMP_END_BAL$0"]').innerText ),
            vacation = Number( ourFrame.querySelector('span[id="DERIVED_TL_COMP_END_BAL$1"]').innerText ),
            personal = Number( ourFrame.querySelector('span[id="DERIVED_TL_COMP_END_BAL$2"]').innerText ),
            leaveText = ourFrame.querySelector('#win0divTL_COMPLEAV_TBLGP\\$0').innerText,
            bonusDateText =  new Date( leaveText.slice( leaveText.lastIndexOf( ':' ) + 2 ) ),
            bonusDate = new Date( bonusDateText.setDate(bonusDateText.getDate() + 1 ) ),
            bonusMonth = bonusDate.getMonth(),
            bonusDay = bonusDate.getDate(),
            startYear = bonusDate.getFullYear(),
            lastUpdateDateText = new Date( leaveText.substr( leaveText.indexOf( ':' ) + 2, 10 ) ),
            lastUpdateDate = new Date( lastUpdateDateText.setDate(lastUpdateDateText.getDate() + 1 ) ),
            personalBonusMonths = [],
            sickAccrualMonths = [],
            yearsOfServiceBonus = {                    
                5: 22.5,
                10: 60,
                20: 97.5
            };

        
        // We will add a <tr> to the PTO section to populate our additional data
        let ptoTable = ourFrame.querySelector('table[id^="TL_COMPLEAV_TBL"] > tbody');
        let tr = document.createElement('tr');
        tr.setAttribute('id','ptoCalc');
        tr.innerHTML = '<td id="ptoCalcWrapper"><table id="ptoCalcTable"><caption>Future Balances</caption><thead></thead><tbody></tbody><tfoot></tfoot></table></td>';
        ptoTable.append(tr);
        
        let calcTable = ourFrame.querySelector('#ptoCalcTable');
        let calcTableTHead = calcTable.querySelector('thead');
        calcTableTHead.innerHTML = '<tr><th>Accrual Dates</th><th>Sick</th><th>Vacation</th><th>Personal</th></tr>';

        // Fill in array values for vacation and personal bonus months.
        // Note: remember that getMonth() produces zero-indexed results ( i.e. Jan = 0 )
        function personalMonths( date ) {  
            let bd1 = new Date( date.toString() );

            personalBonusMonths[0] = bonusMonth;
            personalBonusMonths[1] = new Date( bd1.setMonth(bd1.getMonth() + 4 ) ).getMonth();
            personalBonusMonths[2] = new Date( bd1.setMonth(bd1.getMonth() + 4 ) ).getMonth();
        }

        function sickMonths( date ) {
            let bd1 = new Date( date.toString() );

            sickAccrualMonths[0] = bonusMonth;
            sickAccrualMonths[1] = new Date( bd1.setMonth(bd1.getMonth() + 2 ) ).getMonth();
            sickAccrualMonths[2] = new Date( bd1.setMonth(bd1.getMonth() + 2 ) ).getMonth();
            sickAccrualMonths[3] = new Date( bd1.setMonth(bd1.getMonth() + 2 ) ).getMonth();
            sickAccrualMonths[4] = new Date( bd1.setMonth(bd1.getMonth() + 2 ) ).getMonth();
            sickAccrualMonths[5] = new Date( bd1.setMonth(bd1.getMonth() + 2 ) ).getMonth();
        }


        function addPTOrows( lastUpdate, bonus ) {


            let firstMonth = new Date( bonus.toString() ),
                lastUpdateDate = new Date( lastUpdate.toString() ),
                tableBody = calcTable.querySelector('tbody');

            firstMonth.setFullYear( lastUpdateDate.getFullYear() );
            firstMonth.setMonth( lastUpdateDate.getMonth() );


            // firstMonth.setDate( bd1.getDate() );
            // If this month's bonus date has already occurred, then set
            // our firstMonth variable to next month's bonus date.
            if ( firstMonth < lastUpdate ) {
                firstMonth.setMonth( lastUpdateDate.getMonth() + 1 );
            }


            // Generate the data and rows to our PTO table    
            for ( let x = 0; x < 36; x++ ) {
                let currentMonth = firstMonth.getMonth();                    

                // Add a new row to our PTO table
                let ourTR = document.createElement('tr');
                tableBody.append( ourTR );
                                
                // Add a new <td> with the bonus date for the month
                ourTR.innerHTML = '<td>' + firstMonth.toDateString() + '</td>';

                // Check if this is a sick time bonus month from 
                // the sickAccrualMonths array.
                sickAccrualMonths.forEach(function( value, index ){
                    if ( currentMonth === value ) {

                        if ( index % 2 === 0 ) {
                            sick = Number( sick ) + 14;
                        }
                        else {
                            sick = Number( sick ) + 7;
                        }

                    }   
                });

                // Add the sick value to the table
                let newTD = document.createElement('td');
                newTD = document.createElement('td');
                newTD.innerText = sick;
                ourTR.append(newTD);

                // Increase our vacation time and check to see if it our
                // bonus month.                    
                if ( currentMonth === bonusMonth ) {
                    let numYears = firstMonth.getFullYear() - startYear;

                    // Compare the numbYears value to the 5, 10, 20 year 
                    // bonus years.

                    if ( numYears >= 20 ) {
                        vacation = vacation + yearsOfServiceBonus[20];
                    }
                    else if  ( numYears >= 10 ) {
                        vacation = vacation + yearsOfServiceBonus[10];
                    }
                    else if ( numYears >= 5 ) {
                        vacation = vacation + yearsOfServiceBonus[5];
                    }                            
                }
                vacation = vacation + 7.5                   

                //  Add the vacation value to the table
                newTD = document.createElement('td');
                newTD.innerText = vacation;
                ourTR.append(newTD);

                // Check if this is a personal time bonus month from 
                // the personalBonusMonths array.
                // $.each( personalBonusMonths, function( index, value ) {
                personalBonusMonths.forEach(function( value, index ) {
                    if ( currentMonth === value ) {
                        personal = personal + 7.5;
                    }   
                } ); 

                // Add the personal value to the table
                newTD = document.createElement('td');
                newTD.innerText = personal;
                ourTR.append(newTD);                


                // Increase the firstMonth by one months
                firstMonth.setMonth( firstMonth.getMonth() + 1 );

            }
        }

        // Execute the functions to populate our PTO variables.
        personalMonths( bonusDate );
        sickMonths( bonusDate );
        addPTOrows( lastUpdateDate, bonusDate );
        
        // Scroll the new PTO table into view
        ourFrame.querySelector("#win0divTL_COMPLEAV_TBLGP\\$0").scrollIntoView();
      
        
    } // End if (pto === ptoExpanded)
    
    

} // End ptoChanged()
    


    
    
    
    function injectStyles() {
    
    // All of the elements we want to manipulate are contained within an iframe.
    // We will cache a reference to this iframe's document.
    ourFrame = document.querySelector('#ptifrmtgtframe').contentDocument; 

    ///////////////////////////////////////////////////////////////////////////
    /////////////////////////////  Style Sheets  //////////////////////////////

    // We will have two style sheets.  One for the default view and one for 
    // our Dark Mode view.

    // Default Style sheet for ourFrame (the main content iframe).
    let iframeStyle = document.createElement('style');
    iframeStyle.setAttribute('id','iframeStyle');
    iframeStyle.innerHTML = `
        .PSGROUPBOXLABEL {
            display : none;
        }

        #ptoCalcTable {
            margin : 50px auto 0;
            padding-bottom : 50px;
            font-size : 12px;
            border-collapse : collapse;    
        }

        #ptoCalcTable caption {
            color: white;
            background-color : #b3b3b3;
            margin : 0 auto 15px;
            padding-top : 12px;
            padding-bottom : 12px;
            font-size : 16px;
            font-weight : bold;    
        }

        #ptoCalcTable th {
            color : #426a92;
            font-size : 13px;
            text-align : center !important;
            border-bottom : 2px solid black;
            border-collapse : collapse;
            padding-botton: 15px;    
        }

        #ptoCalcTable td {
            width : 100px;
            height : 30px;
            text-align : right !important;
            border-bottom : 1px solid black;
            border-collapse : collapse;    
        }

        #ptoCalcTable tr:nth-child(even) {
            background-color : #e6e6e6;    
        }
        
    `; // End iframeStyle 
    
    ourFrame.head.append(iframeStyle);

}  // End injectStyles() 
    

    
function darkMode() {
// In the case that we are using darkMode, some of the style rules will override the injectStyles rules
        
    // Get a reference to the main content iframe.
    let ourFrame = document.querySelector('#ptifrmtgtframe').contentDocument;
    
    // Create a style tag that will contain the main window styles.
    let outerDarkStyles = document.createElement('style');
    outerDarkStyles.setAttribute('id', 'outerDarkModeStyle');
    
    // We will inject this stylesheet into the main window document header.
    outerDarkStyles.innerHTML = `
        #pthdr2table > tbody > tr, #pthdr2table > tbody > tr a {
            background-color: black !important;
            color : rgb(85,78,86);
        }
        
        div#pthnavcontainer {
            display : none !important;
        }
    `;
    
    document.head.append(outerDarkStyles);
    
    // Create a style tag that will contain all of our iframe styles.
    let darkStyles = document.createElement('style');
    darkStyles.setAttribute('id', 'darkModeStyle');
    
    // We will inject this stylesheet into the iframe document header
    darkStyles.innerHTML = `
        body, div[id^="win0divTR_WEEKLY_GRID"], 
        [id^="thTR_WEEKLY_GRID"], [id^="TR_WEEKLY_GRID"], td.PSLEVEL1GRIDLABEL, .PSLEVEL1GRIDEVENROW, .PSLEVEL1GRIDODDROW, .PSEDITBOX {
            background-color : rgb(85,78,86)!important
        }
        
        #win0div\\$ICField5 > span, #DERIVED_NAMEFMT_NAME, #win0divDERIVED_TL_WEEK_EMPLIDlbl > span,
        #DERIVED_TL_WEEK_EMPLID, #win0divDERIVED_NAMEFMT_JOBCODE_DESCRlbl > span, #DERIVED_NAMEFMT_JOBCODE_DESCR,
        #win0divDERIVED_TL_WEEK_EMPL_RCDlbl > span, #DERIVED_TL_WEEK_EMPL_RCD, 
        #win0divPAGEBAR > div > table > tbody > tr > td:nth-child(3), 
         #DERIVED_TL_WEEK_VIEW_BY_LIST_LBL, #DATE_DAY1_LBL, #DERIVED_TL_WEEK_VIEW_BY_LIST,
        #win0divDERIVED_TL_WEEK_TL_QUANTITYlbl > span, #win0divDERIVED_TL_WEEK_TOTAL_SUMlbl > span, #DERIVED_TL_WEEK_TL_QUANTITY,
        #DERIVED_TL_WEEK_TOTAL_SUM {
            color : white;
        }

        #DERIVED_TL_WEEK_PREV_WK_BTN, #DERIVED_TL_WEEK_NEXT_WK_BTN, #NEWWIN, #HELP,
        #win0divTL_LINK_WRK_TL_TEXT_LBL1 > div > a, #win0divTL_LINK_WRK_TL_TEXT_LBL2 > div > a,
        .PSLEVEL1GRIDLABEL {
            color : rgb(129,120,103) !important;
        }

        #DERIVED_TL_WEEK_VIEW_BY_LIST, #DATE_DAY1, select.psdropdownlist {
            background-color : rgb(129,120,103) !important;
            border-color: rgb(129,120,103) !important;
            color : white;
        }

        #TR_WEEKLY_GRID\$scrolli\$0 > tbody > tr:nth-child(2) {
            border : none;
        }

        .PSEDITBOX {
            font-weight : bold;
            color : rgb(154,153,156);
            border-width : 0px;
        }

        .PSGROUPBOXLABEL {
            display : none;
        }

        .PSDROPDOWNLIST_DISPONLY, .PSEDITBOX_DISPONLY, .PSHYPERLINKDISABLED {
            color : white !important;
        }
        
        span[id^="TR_WEEKLY_GRID"] {
            color : rgb(253,189,7);
        }

        #ptoCalc {
            background-color : black;
            padding : 50px;
            margin : 50px;
        }

        
        #ptoCalcTable caption {
            color: white;
            background-color : rgb(54,49,55);
        }

        #ptoCalcTable tr:nth-child(even) {
            background-color : rgb(54,49,55);    
        }

        #ptoCalcTable tr {
            color : white; 
            padding-right : 10px !important;
        }

        #ptoCalcTable > thead > tr > th {
            color : rgb(253,189,7); 
            padding-bottom : 5px;
            margin-bottom : 5px;
            border-bottom : 2px solid rgb(253,189,7);
        }

        #ptoCalcTable td {
            border-bottom : 0px solid black;
        }



    `; // End darkStyles.innerHTML

    ourFrame.head.append(darkStyles);
    
}    
    
    
function init() { 
    // Load our Main style sheet 
    injectStyles();
    // Load our DarkMode style sheet if the user has selected it (Note: this overwrites some of the Main style sheets).
    if (useDarkMode === 'true') {
        darkMode();
    }
    if (goFullscreen === 'true') {
        document.querySelector('body').requestFullscreen();
    }
    
    // Create our UI buttons.
    let buttonLocation = document.querySelector('span.greeting');
    buttonLocation.style = "postion: relative;";
    buttonLocation.innerHTML = '<button id="autoFill" style="margin-right:10px; margin-left: 5px;">Auto-fill defaults</button><span id="threeDots" style="width: 20px;">&nbsp;<img src="https://i.ya-webdesign.com/images/three-dots-menu-png-15.png" style="height: 15px; width: 15px; margin: 0; margin-right: 10px; position: absolute; top: 50%; -ms-transform: translateY(-50%); transform: translateY(-50%);" alt="settings icon"/>&nbsp;</span>'; 

    document.querySelector('#autoFill').addEventListener('click', autoFillClicked);

    let threeDots = document.querySelector('#threeDots');
    threeDots.addEventListener('click', saveDefaults);
    
    
    
    // Call our MutaionObserver that will watch for any changes on our page.  (Primarily to 
    // observe the iframe the main content is loaded within.)
    continuousObserver(document.body, ptoChanged);

} // End init()    
  
 
    
function saveDefaults() {    
    // Get reference to the select input that indicates if we are viewing time by Daily, Weekly, or Calendar Period.
    let veiwSelectedIndex = ourFrame.querySelector("#DERIVED_TL_WEEK_VIEW_BY_LIST").selectedIndex;
    
    // Get reference to text fields used to record worked hours.
    let timeInputs = ourFrame.querySelectorAll('input[name^="QTY_DAY"]');
    // Save the value of each timeInput in an array.
    let timeInputsArray = [];
    timeInputs.forEach(function(i){
        timeInputsArray.push(i.value);
    });
    
    let trc = ourFrame.querySelectorAll('select[id^="TRC"]');
    let trcArray = [];
    trc.forEach( (i)=> {
       trcArray.push(i.selectedIndex);
    });
    
    let userField3 = ourFrame.querySelectorAll('input[id^="USER_FIELD_3"]');
    console.log('userField3.length', userField3.length);
    let userField3Array = [];
    userField3.forEach( (i)=> {
        userField3Array.push(i.value);
        console.log('userField3Array[' + i + '].value: ' + i.value);
    });

    // Save the viewSelectedIndex and timeInputsArray to localStorage.
    localStorage.setItem('veiwSelectedIndex', veiwSelectedIndex);
    localStorage.setItem('timeInputsArray', JSON.stringify(timeInputsArray));
    localStorage.setItem('trcArray', JSON.stringify(trcArray));
    localStorage.setItem('userField3Array', JSON.stringify(userField3Array));
}
    
 
    


    
    
   


function goToTimesheet() {
    // Replace current web page body with blank content to show user something is being done.
    document.querySelector('body').innerHTML = '';
    document.location.href = 'https://hr.gmis.in.gov/psp/hrprd/EMPLOYEE/HRMS/c/ROLE_EMPLOYEE.TL_MSS_EE_SRCH_PRD.GBL?FolderPath=PORTAL_ROOT_OBJECT.CO_EMPLOYEE_SELF_SERVICE.HC_TIME_REPORTING.HC_RECORD_TIME';
}
///////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////

// Check if the current page is Timesheet and send user there if not. 
if (document.title !== 'Timesheet') {
    goToTimesheet();
} 

// We are on the proper page so lets initiate our code.    
init();
    
      

})(); // IIFE
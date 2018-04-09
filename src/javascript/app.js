var acceptedPointsData = [];
var acceptedCountData = [];
var myMask = null;
var app = null;
var showAssignedProgram = true;

Ext.define('CArABU.app.MsBurn', {
    extend: 'Rally.app.App',
    componentCls: 'app',

    items: [
        {xtype:'container',itemId:'selector_box', layout: 'hbox'}
    ],

    config: {
        defaultSettings : {
            ignoreZeroValues        : true,
            flatScopeProjection     : false,
            completionDateScope     : false,
            featureCompleteByState  : false,
            featureCompleteState    : "",
            PreliminaryEstimate     : true,
            StoryPoints             : true,
            StoryCount              : false,
            StoryPointsProjection   : true,
            StoryCountProjection    : false,
            AcceptedStoryPoints     : true,
            AcceptedStoryCount      : false,
            AcceptedPointsProjection: true,
            AcceptedCountProjection : false,
            FeatureCount            : false,
            FeatureCountCompleted   : false,
            HistoricalProjection    : false,
            RefinedEstimate : false
        }
    },

    getSettingsFields: function() {
//console.log("getSettingsFields");
        var scopeTypeStore = new Ext.data.ArrayStore({
            fields: ['scope'],
            data : [['Count'],['Points']]
        });

        var checkValues = _.map(createSeriesArray(),function(s) {
            return { name : s.name, xtype : 'rallycheckboxfield', label : s.description};
        });

        var values = [
            {
                name: 'ignoreZeroValues',
                xtype: 'rallycheckboxfield',
                boxLabelAlign: 'after',
                fieldLabel: 'ignoreZeroValues',
                margin: '0 0 15 50',
                labelStyle : "width:200px;",
                afterLabelTpl: 'For projection ignore zero values'
            },
            {
                name: 'flatScopeProjection',
                xtype: 'rallycheckboxfield',
                boxLabelAlign: 'after',
                fieldLabel: 'Flat Scope Projection',
                margin: '0 0 15 50',
                labelStyle : "width:200px;",
                afterLabelTpl: 'Do not project scope values'
            },
            {
                name: 'completionDateScope',
                xtype: 'rallycheckboxfield',
                boxLabelAlign: 'after',
                fieldLabel: 'Use count for Expected Completion Date',
                margin: '0 0 15 50',
                labelStyle : "width:300px;",
                afterLabelTpl: '(otherwise based on points)'
            },
            {
                name: 'featureCompleteByState',
                xtype: 'rallycheckboxfield',
                boxLabelAlign: 'after',
                fieldLabel: 'True if feature completed is based on feature state',
                margin: '0 0 15 50',
                labelStyle : "width:300px;",
                afterLabelTpl: '(otherwise based on 100% story completion)'
            },
            {
                name: 'featureCompleteState',
                xtype: 'rallytextfield',
                boxLabelAlign: 'after',
                fieldLabel: 'Only used if Feature Complete By State is set to true (above)',
                margin: '0 0 15 50',
                labelStyle : "width:200px;",
                afterLabelTpl: '(Optional) Feature state for completed features'
            },
        ];

        _.each(values,function(value){
            value.labelWidth = 250;
            value.labelAlign = 'left'
        });
//console.log("Values: ",checkValues, values)
        return values.concat(checkValues);
    },

    launch: function() {
//console.log("LAUNCH");
        app = this;
        app.series = createSeriesArray();
        app.ignoreZeroValues = app.getSetting("ignoreZeroValues");
        app.flatScopeProjection = app.getSetting("flatScopeProjection");
        app.completionDateScope = app.getSetting("completionDateScope")
        app.featureCompleteByState = app.getSetting("featureCompleteByState");
        app.featureCompleteState = app.getSetting("featureCompleteState");
        app.msName = "";
        app.msDate = "";
//        app.configReleases = app.getSetting("releases");

        var selectMilestone = this.down('#selector_box').add({
            xtype: 'rallymilestonecombobox',
            clearText: 'Select a Milestone: ',
            itemId: 'get_milestone',
            name: 'get_milestone',
            margin: 10,
            allowClear: true,
            storeConfig: {
            },
            listeners: {
                scope: this,
                change: function(me, newValue, oldValue) {
                    if (newValue) {
                        app.milestones = newValue;
                        app.msName = me.getRecord().get('Name');
                        app.msDate = me.getRecord().get('TargetDate');
                        app.dothisnext();
                    }
                }
            }
        });
    },

    dothisnext: function() {
        var that = this;
        // get the project id.
        this.project = this.getContext().getProject().ObjectID;
        var configs = [];

        // query for estimate values, releases and iterations.
        configs.push({ model : "PreliminaryEstimate",
                       fetch : ['Name','ObjectID','Value'],
                       filters : []
        });
        configs.push({ model : "Milestone",
                       fetch : ['Name', 'ObjectID','Artifacts', 'Projects', 'TargetDate', 'TargetProject' ],
                       filters: [{property: 'Name', operator: '=', value: app.msName}]
        });
        configs.push({ model : "TypeDefinition",
                       fetch : true,
                       filters : [ { property:"Ordinal", operator:"=", value:0} ]
        });

        // get the preliminary estimate type values, and the releases.
        async.map( configs, app.wsapiQuery, function(err,results) {
//console.log("Results: ", results);
            app.peRecords   = results[0];
            app.releases    = results[1];
            app.featureType = results[2][0].get("TypePath");

            configs = [
                {
                    model  : "Iteration",
                    fetch  : ['Name', 'ObjectID', 'Project', 'StartDate', 'EndDate' ],
//                    filters: app.createIterationFilter(app.releases)
                }
            ];

            // get the iterations
            async.map( configs, app.wsapiQuery, function(err,results) {
                app.iterations = results[0];
//console.log("Iterations: ", app.iterations);
                app.queryFeatures();
            });
        });
    },

    // remove leading and trailing spaces
    trimString : function (str) {
//console.log("trimString");
        return str.replace(/^\s\s*/, '').replace(/\s\s*$/, '');
    },

    createIterationFilter : function(releases) {
//console.log("createReleaseFilter");
        var extent = app.getReleaseExtent(releases);

        var filter = Ext.create('Rally.data.wsapi.Filter', {
            property : 'EndDate', operator: ">=", value: extent.isoStart
        });

        filter = filter.and( Ext.create('Rally.data.wsapi.Filter', {
                property : 'EndDate', operator: "<=", value: extent.isoEnd
            })
        );

        return filter;
    },

//    getReleaseExtent : function( releases ) {
    getReleaseExtent : function( features ) {
//console.log("getReleaseExtent");
        var start = _.min(_.pluck(features,function(r) { return r.get("ActualStartDate");}));
        var end   = _.max(_.pluck(features,function(r) { return r.get("ActualEndDate");}));
        var isoStart  = Rally.util.DateTime.toUtcIsoString(start, false);  //earliest Feature.ActualStartDate
        var isoAEnd = Rally.util.DateTime.toUtcIsoString(end, false);  //latest Feature.ActualEndDate
        var isoCEnd = Rally.util.DateTime.toUtcIsoString(new Date(), false);  //current
//        var isoEnd = isoAEnd > isoCEnd ? isoAEnd : isoCEnd;
        if (app.msDate) {
            isoEnd    = Rally.util.DateTime.toUtcIsoString(app.msDate, false);
        }
console.log("ISO dates: ", isoStart, isoEnd);
        return { start : start, end : end, isoStart : isoStart, isoEnd : isoEnd };

/*
        var start = _.min(_.pluck(releases,function(r) { return r.get("ReleaseStartDate");}));
        var end   = _.max(_.pluck(releases,function(r) { return r.get("ReleaseDate");}));
        var isoStart  = Rally.util.DateTime.toIsoString(start, false);
        var isoEnd    = Rally.util.DateTime.toIsoString(end, false);

        return { start : start, end : end, isoStart : isoStart, isoEnd : isoEnd };
*/
    },

    // generic function to perform a web services query
    wsapiQuery : function( config , callback ) {
        Ext.create('Rally.data.WsapiDataStore', {
            autoLoad : true,
            limit : "Infinity",
            model : config.model,
            fetch : config.fetch,
            filters : config.filters,
            listeners : {
                scope : this,
                load : function(store, data) {
                    callback(null,data);
                }
            }
        });

    },
/*
    queryEpicFeatures : function() {
console.log("queryEpicFeatures");
        myMask = new Ext.LoadMask(Ext.getBody(), {msg:"Please wait..."});

        var filter = null;
        var epicIds = app.epicIds.split(",");

        if (epicIds.length === 0) {
            app.add({html:"No epic id's specified"+app.configReleases});
            return;
        }

        _.each(epicIds, function( epicId, i) {
            var f = Ext.create('Rally.data.QueryFilter', {
                property: 'Parent.FormattedID',
                operator: '=',
                value: epicId
            });
            filter = i === 0 ? f : filter.or(f);
        });

        return Ext.create('Rally.data.WsapiDataStore', {
            autoLoad: true,
            model : app.featureType,
            limit : 'Infinity',
            fetch: ['ObjectID','FormattedID' ],
            filters: [filter],
            listeners: {
                load: function(store, features) {
                    console.log("Loaded:"+features.length," Features.");
                    app.features = features;
                    if (app.features.length === 0) {
                        app.add({html:"No features for parent PortfolioItem :"+app.epicIds});
                        return;
                    } else {
                    app.queryFeatureSnapshots();
                    }
                }
            }
        });

    },
*/
    queryFeatures : function() {
//console.log("queryFeatures");
        this.setLoading("Loading Features for Milestone...");
        myMask = new Ext.LoadMask(Ext.getBody(), {msg:"Please wait..."});
        var filter = null;
        var me = this;

        var releaseNames = _.uniq(_.map(app.releases,function(r){ return r.get("Name");}));
        console.log("releaseNames",releaseNames);
        console.log("FeatureType",app.featureType);
/*
        _.each( releaseNames , function( release, i ) {
            var f = Ext.create('Rally.data.QueryFilter', {
                property: 'Release.Name',
                operator: '=',
                value: release
            });
            filter = i === 0 ? f : filter.or(f);
        });

        // add filter for milestone.
        if (!_.isNull(app.milestones) && app.milestones != "") {
            var f = Ext.create('Rally.data.QueryFilter', {
                property: 'Milestones.Name',
                operator: '=',
                value: app.milestones
            });
            filter = filter.and(f);
        }
        console.log("Filter:",filter.toString());
*/
        return Ext.create('Rally.data.WsapiDataStore', {
            autoLoad: true,
//            model: 'PortfolioItem/Feature',
            model : app.featureType,
            limit : 'Infinity',
            fetch: ['ObjectID','FormattedID','Milestones','Name','ActualStartDate','ActualEndDate' ],
            filters: [{property: "Milestones.Name", operator: "=", value: app.msName}],
//            filters: [filter],
            listeners: {
                load: function(store, features) {
console.log("Loaded:"+features.length," Features.",features);
//                    console.log(_.map(features,function(f){return f.get("FormattedID")}));
                    app.features = features;
                    if (app.features.length === 0) {
                        me.setLoading(false);
                        alert("No features for Milestone: "+app.msName);
                        return;
                    } else {
                    app.queryFeatureSnapshots();
                    }
                }
            }
        });
    },

    queryFeatureSnapshots : function () {
//console.log("queryFeatureSnapshots");
        this.setLoading("Loading snapshots...");
        var ids = _.pluck(app.features, function(feature) { return feature.get("ObjectID");} );
        var extent = app.getReleaseExtent(app.features);
        // var pes = _.pluck(app.features, function(feature) { return feature.get("PreliminaryEstimate");} );
//        var extent = app.getReleaseExtent(app.releases);

        var storeConfig = {
            find : {
                // '_TypeHierarchy' : { "$in" : ["PortfolioItem/PIFTeam"] },
                'ObjectID' : { "$in" : ids },
                '_ValidTo' : { "$gte" : extent.isoStart }
            },
            autoLoad : true,
            pageSize:1000,
            limit: 'Infinity',
            fetch: ['_UnformattedID','ObjectID','_TypeHierarchy','PreliminaryEstimate', 'LeafStoryCount','LeafStoryPlanEstimateTotal','AcceptedLeafStoryPlanEstimateTotal','AcceptedLeafStoryCount','PercentDoneByStoryCount','RefinedEstimate','State'],
            hydrate: ['_TypeHierarchy','State']
        };

        storeConfig.listeners = {
            scope : this,
            load: function(store, snapshots, success) {
                console.log("Loaded:"+snapshots.length," Snapshots.", snapshots);

                app.createChartData(snapshots);
            }
        };

        var snapshotStore = Ext.create('Rally.data.lookback.SnapshotStore', storeConfig);
    },

    createChartData : function ( snapshots ) {
//console.log("CCD 1");
        this.setLoading("Aggregating data...");
        var that = this;
//        var lumenize = Rally.data.lookback.Lumenize || window.parent.Rally.data.lookback.Lumenize;
        var snapShotData = _.map(snapshots,function(d){return d.data;});
        var extent = app.getReleaseExtent(app.features);

//        var extent = app.getReleaseExtent(app.releases);

        var snaps = _.sortBy(snapShotData,"_UnformattedID");
        // can be used to 'knockout' holidays
        var holidays = [
            //{year: 2014, month: 1, day: 1}  // Made up holiday to test knockout
        ];
//console.log("CCD 2: ", lumenize);
        var myCalc = Ext.create("MyBurnCalculator", {
            series : app.series,
            ignoreZeroValues : app.ignoreZeroValues,
            flatScopeProjection : app.flatScopeProjection,
            peRecords : app.peRecords,
            featureCompleteByState : app.featureCompleteByState,
            featureCompleteState : app.featureCompleteState
        });
//console.log("CCD 3: ", myCalc);
        // calculator config
        var config = {
            deriveFieldsOnInput: myCalc.getDerivedFieldsOnInput(),
            metrics: myCalc.getMetrics(),
            summaryMetricsConfig: [],
            deriveFieldsAfterSummary: myCalc.getDerivedFieldsAfterSummary(),
            granularity: myCalc.lumenize.Time.DAY,
            tz: 'America/Chicago',
            holidays: holidays,
            workDays: 'Monday,Tuesday,Wednesday,Thursday,Friday,Saturday,Sunday'
        };
//console.log("before chart: ", extent.isoStart);
        // release start and end dates
//        var startOnISOString = "2017-01-01T15:50:31Z";
        var startOnISOString = extent.isoStart;
//console.log("start: ", extent.isoStart, startOnISOString);
//        var upToDateISOString = new lumenize.Time(extent.end).getISOStringInTZ(config.tz);
//        var upToDateISOString = "2018-06-18T15:50:31Z";
        var upToDateISOString = extent.isoEnd;
//console.log("end: ", extent.isoEnd, upToDateISOString);
        // create the calculator and add snapshots to it.
        calculator = new myCalc.lumenize.TimeSeriesCalculator(config);
//        new lumenize.TimeSeriesCalculator(config);
        calculator.addSnapshots(snapShotData, startOnISOString, upToDateISOString);

        // create a high charts series config object, used to get the hc series data
        var hcConfig = [{ name : "label" }];
        _.each( app.series, function(s) {
            if ( app.getSetting(s.name)===true) {
                hcConfig.push({
                   name : s.description, type : s.display
                });
            }
        });

        var hc = myCalc.lumenize.arrayOfMaps_To_HighChartsSeries(calculator.getResults().seriesData, hcConfig);

        this.showChart( trimHighChartsConfig(hc) );
    },

    createPlotLines : function(seriesData) {
//console.log("createPlotLines-seriesdata",seriesData);
        // filter the iterations
        var start = new Date( Date.parse(seriesData[0]));
        var end   = new Date( Date.parse(seriesData[seriesData.length-1]));
//console.log("createPlotLines-start-end",start,end);
        var releaseI = _.filter(this.iterations,function(i) { return i.get("EndDate") >= start && i.get("EndDate") <= end;});
        releaseI = _.uniq(releaseI,function(i) { return i.get("Name");});
//console.log("createPlotLines-releaseI",releaseI);
        var itPlotLines = _.map(releaseI, function(i){
            var d = new Date(Date.parse(i.raw.EndDate)).toISOString().split("T")[0];
            return {
                label : i.get("Name"),
                dashStyle : "Dot",
                color: 'grey',
                width: 1,
                value: _.indexOf(seriesData,d)
            };
        });
        // create release plot lines
//console.log("createPlotLines",this.selectedReleases,selectedReleases.raw.ReleaseDate);
//        var rePlotLines = _.map(this.selectedReleases, function(i){
        var rePlotLines = _.map(app.milestones, function(i){
            var d = new Date(Date.parse(app.msDate)).toISOString().split("T")[0];
            return {
                label : app.msName,
                // dashStyle : "Dot",
                color: 'grey',
                width: 1,
                value: _.indexOf(seriesData,d)
            };
        });
//console.log("createPlotLines",itPlotLines,rePlotLines);
        return itPlotLines.concat(rePlotLines);

    },


    showChart : function(series) {
//console.log("showChart");
        this.setLoading("Building Chart...");
        var that = this;

        app.expectedCompletionDate = calcCompletionIndex1(series,
        app.completionDateScope == true ? "Count" : "Points");
        console.log("Expected Completed Date1",app.expectedCompletionDate);

        var chart = this.down("#chart1");
        if (chart) { chart.removeAll(); }

        // create plotlines
//console.log("showChart",series[0].data);
        var plotlines = this.createPlotLines(series[0].data);
//console.log("showChart",plotlines);

        // set the tick interval
//        var tickInterval = series[1].data.length <= (7*20) ? 7 : (series[1].data.length / 20);
        var tickInterval = series[1].data.length <= (7*20) ? 7 : (series[1].data.length / 20);
//console.log("showChart",tickInterval);
        var msTarget = app.msDate ? Rally.util.DateTime.format(app.msDate, 'Y-m-d') : ""
        var extChart = Ext.create('Rally.ui.chart.Chart', {
//        var chart = this.down("#display_box").add({
            width: 800,
            height: 600,
            columnWidth : 1,
            itemId : "chart1",
            chartData: {
                categories : series[0].data,
                series : series.slice(1, series.length)
            },

            chartColors : createColorsArray(series),

            chartConfig : {
                chart: {
                },
                title: {
                text: 'Milestone Burnup ('+ app.msName  +')' ,

 //               x: -20 //center
                },
                subtitle : {
                    text: "Milestone Target Date: "+msTarget +"<br>Expected Completion Date: "+app.expectedCompletionDate
                },
                plotOptions: {
                    series: {
                        marker: {
                            radius: 2
                        }
                    }
                },
                xAxis: {
                    plotLines : plotlines,
                    //tickInterval : 7,
                    tickInterval : tickInterval,
                    type: 'datetime',
                    labels: {
                        formatter: function() {
                            return Highcharts.dateFormat('%b %d', Date.parse(this.value));
                        }
                    }
                },
                yAxis: {
                    title: {
                        text : 'Points/Count'
                    },
                    plotLines: [{
                        value: 0,
                        width: 1,
                        color: '#808080'
                    }]
                },
                tooltip: {
                },
                legend: { align: 'center', verticalAlign: 'bottom' }
            }
        });
//console.log("adding chart ",extChart);
        this.add(extChart);
        chart = this.down("#chart1"); //#display_box
        this.setLoading(false);
        var p = Ext.get(chart.id);
        elems = p.query("div.x-mask");
        _.each(elems, function(e) { e.remove(); });
        var elems = p.query("div.x-mask-msg");
        _.each(elems, function(e) { e.remove(); });

    }

});
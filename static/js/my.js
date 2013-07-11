var svp = {};

function hashRandom(str) {
    if (str.length == 0) return 0;
    var hash = Math.round(Math.random()*100000);
    for (i = 0; i < str.length; i++) {
	char = str.charCodeAt(i);
	hash = ((hash<<5)-hash)+char;
	hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
}

function randomColor() { return "#"+('00000'+(Math.random()*(1<<24)|0).toString(16)).slice(-6); }

function complementHex(hex_color) {
    c = hex_color.replace(/^#/,'')
    sum = parseInt(c[0]+c[1], 16)
    sum += parseInt(c[2]+c[3], 16)
    sum += parseInt(c[4]+c[5], 16)
    return (sum < 200)?"#FFFFFF":"#000000";
}

function hhmmss(seconds,frac) {
    return moment.unix(seconds-68400).format("HH:mm:ss"+(frac?".S":""))
}

svp.loadUrls = function(query, process) {
    $.ajax({
	url: "urls.json",
	cache: false,
	dataType: "json"
    }).done(function(data,status,xhr){
	process(data);
    }).fail(function(xhr,error){
	console.log("Typeahead XHR Error:",error);
    });
}
$("#video-url").typeahead({source:svp.loadUrls});

$(function(){

    function syncVolume(e,ui) {
	svp.player.volume = ui.value/100; }
    $("#volume").slider({
	orientation: "vertical",
	range: "min",
	value: 100,
	slide: syncVolume, change: syncVolume
    }).hide().parent().hover(function(){
	$("#volume").show()
    },function(){
	$("#volume").hide();
    }).click(function(){
	el = $("#volume");
	val = el.slider("value");
	if (val !== 0) {
	    el.data("old-volume",val);
	    el.slider("value",0);
	} else {
	    val = el.data("old-volume");
	    el.slider("value",val?val:100);
	}
    });

    $("#timeline").data("bumped",false);
    function syncPos(e) {
	svp.watchers[0].pos = Math.round(svp.player.currentTime*10)/10;
	$(".watcher:first-of-type .time").text(hhmmss(svp.watchers[0].pos,true));
	$("#global-pos").css("width",(svp.player.currentTime/svp.player.duration*100)+"%");
	texts = [hhmmss(svp.player.currentTime),
		 "-"+hhmmss(svp.player.duration-svp.player.currentTime)];
	$(".span1.time").each(function(index,el){
	    $(el).text(texts[index]);
	});
	time = svp.player.currentTime;
	origmin = min = $("#timeline").slider("option","min");
	origmax = max = $("#timeline").slider("option","max");
	$("#slider-view").css("width",(max-min)/svp.player.duration*100+"%")
	    .css("left",min/svp.player.duration*100+"%");
	chgsize = (max-min)-10;
	while (time+3>max) {
	    $("#timeline").slider("option",{
		min: min+chgsize, max: max+chgsize
	    });
	    min += chgsize; max += chgsize;
	}
	while (time-3<min) {
	    $("#timeline").slider("option",{
		min: min-chgsize, max: max-chgsize
	    });
	    min -= chgsize; max -= chgsize;
	}
	if (min<0) { $("#timeline").slider("option",{min:0,max:max-min}); }
	if (max>svp.player.duration) {
	    $("#timeline").slider("option", {min:svp.player.duration-(max-min),
					     max:svp.player.duration}); }
	if ($("#timeline").slider("option","min") !== origmin ||
	    $("#timeline").slider("option","max") !== origmax) {
	    $("#timeline").data("bumped",true); }
	svp.ws.broadcast({type:"timeupdate", pos:svp.watchers[0].pos, id:svp.video.id});
	syncAllPos();
    }

    function syncAllPos() {
	pos = [];
	for (i in svp.watchers) {
	    if (i !== "length") {
		pos.push(svp.watchers[i].pos);
		$($(".watcher").get(i)).children(".time").text(hhmmss(svp.watchers[i].pos,true));
	    }
	}
	$("#timeline").slider("option","values",pos);
    }
    
    function doubleRate(el) {
	if (Math.abs(svp.player.playbackRate) < 8) {
	    svp.player.playbackRate *= 2;
	    $(el).html("&times;"+Math.abs(svp.player.playbackRate));
	    $(".playpause i").addClass("icon-play");
	    $(".playpause i").removeClass("icon-pause");
	} else {
	    svp.player.playbackRate = 1;
	    $(el).html($(el).data("original-html"));
	    $(".playpause i").removeClass("icon-play");
	    $(".playpause i").addClass("icon-pause");
	}
    }

    svp.reverseSeeking = false;
    function reverseSeek() {
	if (svp.player.playbackRate > 0) {
	    svp.reverseSeeking = false;
	    return false;
	}
	svp.reverseSeeking = true;
	svp.player.currentTime += svp.player.playbackRate/2-0.5
	setTimeout(reverseSeek,500);
    }

    function resetTransport() {
	$("#fast-forward").html($("#fast-forward").data("original-html"));
	$("#fast-back").html($("#fast-back").data("original-html"));
    }

    $("#transport .btn[id]").click(function(e){
	resetTransport();
	resetSync();
	if (this.id.indexOf("fast") >= 0) {
	    svp.player.play();
	    if (!$(this).data("original-html")) {
		$(this).data("original-html",$(this).html()); }
	    if (this.id.indexOf("forward") >= 0) {
		if (svp.player.playbackRate < 0) {
		    svp.player.playbackRate = 1; }
		doubleRate(this);
	    } else {
		if (svp.player.playbackRate > 0) {
		    svp.player.playbackRate = -1; }
		doubleRate(this);
		reverseSeek();
	    }
	} else if (this.id.indexOf("jump") >= 0) {
	    svp.player.playbackRate = 1;
	    svp.player.currentTime += ((this.id.indexOf("back")>=0)?-300:300);
	    broadcastJump();
	}
    });

    function broadcastJump(from) {
	svp.ws.broadcast({
	    id: svp.video.id,
	    type: "jump",
	    pos: svp.player.currentTime,
	    from: from
	});
    }

    function broadcastStateChange() {
	svp.ws.broadcast({
	    id: svp.video.id,
	    type: "statechange",
	    paused: svp.player.paused
	});
    }

    svp.tlsize = 100;
    function rebuildTimeline() {
	min = max = null;
	tlsize = svp.tlsize;
	try {
	    min = svp.player.currentTime-10;
	    max = svp.player.currentTime+(tlsize-10);
	} catch (err) { }
	try {
	    min = $("#timeline").slider("option","min");
	    max = $("#timeline").slider("option","max");
	} catch (err) { }
	if (max-min !== tlsize) {
	    max = min+tlsize; }
	try {
	    $("#timeline").slider("destroy");
	} catch (err) { }
	values = [];
	for (i in svp.watchers) {
	    if (i !== "length") {
		values.push(svp.watchers[i].pos); } }
	$("#timeline").slider({
	    animate: true,
	    min: min?min:-10, max: max?max:tlsize-10,
	    range: "min",
	    step: 0.1,
	    values: values,
	    slide: function(e,ui) {
		if (!$("#timeline").data("bumped") && $(ui.handle).is(":first-of-type")) {
		    $(ui.handle).next("div").remove()
		    resetSync();
		    if (ui.value < 0) { e.preventDefault(); return false; }
		    svp.player.currentTime = ui.value;
		} else {
		    e.preventDefault(); }
	    },
	    stop: function(e,ui) {
		$("#timeline").data("bumped",false);
		broadcastJump();
	    },
	    start: function(e,ui) {
		$("#timeline").data("bumped",false);
	    }
	}).hover(function(){
	    $("#timeline a:not(:first-of-type)").css("zIndex",1);
	},function(){
	    $("#timeline a:not(:first-of-type)").css("zIndex",2);
	});
	$("#timeline").children("a").each(function(index,el){
	    node = $(el).attr("title",svp.watchers[index].name).attr("data-toggle","tooltip")
		.tooltip().css("background-color",svp.watchers[index].color)
		.css("background-image","none").css("opacity",(svp.watchers[index].hidden?
							       0.2:1));
	});
	$("#watchers h4 .badge-info").text(svp.watchers.length);
    }
    svp.rebuildTimeline = rebuildTimeline;

    function resetSync() {
	$("button.sync.active").each(function(index,el){
	    name = $(el).parent().parent().prev().prev().text();
	    svp.ws.message({
		id: svp.video.id,
		type: "sync",
		sync: false,
	    },name);
	    $(el).effect("highlight").btn("toggle");
	});
	svp.video.syncTo = 0;
    }

    function addWatcher(watcher) {
	index = svp.watcherIndices[watcher.name] = svp.watchers.push(watcher)-1;
	colorstyles = watcher.color?' style="background-color:'+watcher.color+';'+
	    'color:'+complementHex(watcher.color.substr(1))+'"':"";
	$('<li class="watcher you row-fluid"'+colorstyles+'>'+
          '<div class="span4 name">'+watcher.name+'</div>'+
          '<div class="span4 time">Loading...</div>'+
	  '<div class="span4 actions"><div class="btn-group pull-right">'+
	  '<button class="btn sync">'+(watcher.name=="You"?"De-sync":"Sync")+'</button>'+
          '<button class="btn dropdown-toggle" data-toggle="dropdown">'+
	  '<span class="caret"></span></button><ul class="dropdown-menu">'+
	  '<li><a href="#" class="watcher-hide">Darken</a></li>'+
          '</ul></div></div></li>').appendTo("#watchers");
	$("a.watcher-hide").eq(index).click(function(e) {
	    e.preventDefault();
	    index = $(this).data("watcher-index");
	    $(this).parent().toggleClass("active")
	    $(".watcher").eq(index).toggleClass("hidden-watcher");
	    svp.watchers[index].hidden = !svp.watchers[index].hidden;
	    svp.rebuildTimeline();
	}).data("watcher-index",index);
	$("button.sync").eq(index).btn().click(function(e) {
	    resetSync();
	    $(this).btn('toggle');
	    index = $(this).data("watcher-index");
	    svp.video.syncTo = index;
	    if (index === 0) {
		$(this).btn('toggle');
		return false; }
	    svp.player.currentTime = svp.watchers[index].pos;
	    svp.ws.message({
		id: svp.video.id,
		type: "sync",
		sync: true
	    },svp.watchers[index].name);
	}).data("watcher-index",index);
	rebuildTimeline()
    }
    svp.addWatcher = addWatcher;
    
    function loadVideo(url,id) {
	video = {};
	video.url = url;
	video.id = id?id:hashRandom(video.url).toString(36);
	video.chats = [];
	if (video.id == "0") {
	    return false; }
	try {
	    $(".container-fluid.hide").removeClass("hide").show();
	    $("#volume").show()
		.position({"my":"center bottom","at":"center","of":$("#volume").prev()}).hide();
	} catch (err) {}
	svp.video = video;
	svp.watchers = [];
	svp.watcherIndices = {};
	$("#link").val(location.origin+"/#join:"+svp.video.id);
	$(".watcher").remove()
	$("#player").attr("src",svp.video.url);
	svp.player.load();
	$("#current-url a").attr("href",svp.video.url).text(svp.video.url).click(
	    function(e){ e.preventDefault(); });
	svp.addWatcher({
	    name: "You",
	    pos: 0,
	    color: null
	});
	return true;
    }
    svp.loadVideo = loadVideo;
    $("#load-video-modal .modal-footer .btn-info").click(function(e) {
	if (!svp.loadVideo($("#video-url").val())) {
	    e.preventDefault();
	} else { location.assign("#"); }
    });

    blackbg = "body, .well, .progress, #chat-frame, #chat-entry, #current-url a";
    svp.resetPlayState = function() {
	$(".playpause i").removeClass("icon-pause");
	$(".playpause i").addClass("icon-play");
	$("#info .progress-default").removeClass("progress-striped active");
    }
    svp.lightsOn = function() {
	/* Turn on the lights... */
	$(blackbg).removeClass("blackbg muted",1000).removeClass("blackbg muted");
	$(".btn").removeClass("btn-inverse",500);
	$(".btn i").delay(300).removeClass("icon-white",1);
	$("#lights-text").text("Out");
	svp.lightsAreOn = true;
	/* --- */
    }
    svp.lightsOff = function() {
	/* Turn out the lights... */
	$(blackbg).stop(true,true).addClass("blackbg muted");
	$(".btn").stop(true,true).addClass("btn-inverse");
	$(".btn i").stop(true,true).addClass("icon-white");
	$("#lights-text").text("On");
	svp.lightsAreOn = false;
	/* --- */
    }
    svp.lightsAreOn = true;

    function stateChange(from) {
	resetTransport();
	if (!from) {
	    resetSync(); }
	if (svp.player.playbackRate !== 1) {
	    svp.player.playbackRate = 1;
	    $(".playpause i").toggleClass("icon-pause icon-play");
	    broadcastJump();
	    return false; }
	svp.resetPlayState();
	if (svp.player.readyState === 0) { svp.player.load(); console.log("Loading..."); }
	if (svp.player.paused) {
	    svp.lightsOff();
	    svp.player.play();
	    $("#info .progress-default").addClass("progress-striped active");
	    $(".playpause i").toggleClass("icon-pause icon-play");
	} else {
	    svp.player.pause();
	}
	broadcastStateChange(from);
    }

    $(".playpause, #player").click(function(){ stateChange(); });
    $("#lights-control").click(function(){
	(svp.lightsAreOn?svp.lightsOff:svp.lightsOn)();
    });

    svp.player = $("#player").get(0);
    svp.player.addEventListener("timeupdate",syncPos);
    svp.player.addEventListener("ended",svp.resetPlayState);

    function receiveChat(from,message,time) {
	if (!message) { return false; }
	colorstyle = 'background-color:'+svp.watchers[svp.watcherIndices[from]].color;
	timestamp = time?time:new Date().getTime()/1000;
	svp.video.chats.push({from:from,message:message,time:timestamp});
	$("#chat-messages").append('<div class="media">'+
				   '<a class="pull-left chat-icon" style="'+colorstyle+'"></a>'+
				   '<div class="media-body">'+
				   '<div class="pull-right chat-time text-info" data-livestamp="'+
				   timestamp+'"></div>'+
				   '<h5 class="media-heading">'+from+'</h5>'+
				   '<div class="chat-message">'+message+'</div>'+
				   '</div></div>');
	$("#chat-messages").scrollTop($("#chat-messages").prop("scrollHeight"));
    }
    $("#chat-input").keyup(function(e){
	if (e.which == 13) {
	    svp.ws.broadcast({
		type: "chat",
		id: svp.video.id,
		message: $("#chat-input").val()
	    });
	    receiveChat("You",$("#chat-input").val());
	    $("#chat-input").val('');
	}
    });

    svp.ws = WSChat();
    svp.ws.onerror = function(code,message) {
	console.log(code,message);
	if (code == 305) {
	    location.assign("#error:nameexists");
	    location.reload();
	}
    };
    svp.ws.onmessage = function(data,from,e) {
	if (data.type == "info") {
	    processChats = false;
	    if (!svp.video || svp.video.url !== data.url) {
		svp.player.addEventListener("canplay",function() {
		    console.log("Canplay");
		    svp.player.currentTime = data.mypos; });
		svp.loadVideo(data.url,svp.joinid);
		if (data.paused !== svp.player.paused) { stateChange(); }
		processChats = true;
	    }
	    if (!(name in svp.watcherIndices)) {
		addWatcher({
		    name: from,
		    pos: data.mypos,
		    color: randomColor()
		});
	    }
	    if (processChats) {
		for (i in data.chats) {
		    if (i !== "length") {
			chatfrom = data.chats[i].from;
			if (chatfrom == "You") { chatfrom = from; }
			if (chatfrom == sessionStorage.svpUsername) { chatfrom = "You"; }
			try {
			    receiveChat(chatfrom,data.chats[i].message,data.chats[i].time);
			} catch (err) { }
		    }
		}
	    }
	} else if (data.type == "sync") {
	    console.log(from);
	    $(".watcher").eq(svp.watcherIndices[from]).effect("highlight")
		.attr("title",data.sync?"Synced to you":"No longer synced to you");
	}
    };
    svp.ws.onbroadcast = function(data,from,e) {
	if (data.id != ((svp.video&&svp.video.id)?svp.video.id:svp.joinid)) { return false; }
	if (data.type == "join") {
	    svp.ws.message({
		type: "info",
		url: svp.video.url,
		id: svp.video.id,
		chats: svp.video.chats,
		paused: svp.player.paused,
		mypos: svp.watchers[0].pos
	    },from);
	    if (!(from in svp.watcherIndices)) {
		svp.addWatcher({
		    name: from,
		    pos: 0,
		    color: randomColor()
		});
	    }
	} else if (data.type == "timeupdate") {
	    try {
		svp.watchers[svp.watcherIndices[from]].pos = data.pos;
		syncAllPos();
	    } catch (err) { }
	} else if (data.type == "jump") {
	    try {
		if (svp.watcherIndices[from] === svp.video.syncTo) {
		    if (!data.from || svp.watcherIndices[data.from] !== svp.video.syncTo) {
			svp.player.currentTime = data.pos;
			broadcastJump(from);
		    }
		}
	    } catch (err) { }
	} else if (data.type == "statechange") {
	    try {
		if (svp.watcherIndices[from] === svp.video.syncTo) {
		    if (data.paused !== svp.player.paused) { stateChange(from); }
		}
	    } catch (err) { }
	} else if (data.type == "chat") {
	    receiveChat(from,data.message);
	}
    };
    svp.ws.onquit = function(who,e) {
	try {
	    index = svp.watcherIndices[who];
	} catch (err) { return false; }
	if (index === svp.video.syncTo) {
	    resetSync();
	} else if (index < svp.video.syncTo) {
	    svp.video.syncTo -= 1; }
	svp.watchers.splice(index,1);
	for (i in svp.watcherIndices) {
	    if (svp.watcherIndices[i] > index) {
		svp.watcherIndices[i] -= 1; }
	}
	delete svp.watcherIndices[who];
	$(".watcher").eq(index).remove();
	rebuildTimeline();
    }    

    function watcherExists(name) {
	for (i in svp.watchers) {
	    if (i !== "length") {
		if (svp.watchers[i].name == name) {
		    return true;
		}
	    }
	}
    }

    function init(name) {
	sessionStorage.svpUsername = name
	$("#load-video-modal").modal('show');
	if (location.hash.substr(1,5) == "join:") {
	    $("#load-video-modal").modal('hide');
	    svp.ws.onconnected = function(e) {
		svp.joinid = location.hash.substr(6);
		svp.ws.broadcast({type:"join",id:svp.joinid}); }
	}
	svp.ws.init("ws://"+location.host+"/wschat",name);
    }
    svp.initializeClient = init;
    $("#get-link-modal").modal("show").modal("hide");
    $("#set-name-modal").modal({
	backdrop: "static",
	keyboard: false,
	show: true
    }).modal('show');
    
    if (location.hash.substr(1,10) == "error:name") {
	$("#nickname").val(sessionStorage.svpUsername);
	textel = $("#set-name-modal .alert-error").removeClass("hide").children("span");
	error = location.hash.substr(7);
	if (error == "nameexists") {
	    textel.html("Someone with that username is already connected to the server!<br>Please use a different username.");
	} else {
	    textel.html("A Username error occured! Please try again.");
	}
    } else if (sessionStorage.svpUsername) {
	$("#set-name-modal").modal('hide');
	init(sessionStorage.svpUsername);
    }
    $("#set-name-modal .modal-footer .btn").click(function(){
	name = $("#nickname").val();
	if (name) {
	    $("#set-name-modal").modal("hide");
	    init(name);
	}
    })

});

setOalls();

var data = {
	active: initText,
	google : {families: ['Cardo:italic', 'Roboto:300,100', 'Cutive Mono', 'Oranienbaum', 'Nunito Sans:900,700,500,300,200']}
};

WebFont.load(data);

var oallht;
var oallwth;
var oallctr;

function setOalls(){
	 oallht = $(document).height();
	 oallwth = $(document).width(); 
	 winht = $(window).height();
	 oallctr = {x: (oallwth/2), y: (oallht/2) };
	 formht = $('#formcontainer').height();
	 $('#plate').css({
		 height: winht
	 });
}

function initText(){
	setOalls();
}

$( window ).resize(function() {
	setOalls();
});
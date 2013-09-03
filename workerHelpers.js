/* globals tolerance, ignoreAntialiasing, ignoreColors */

function loop(x, y, callback){
	var i,j;

	for (i=0;i<x;i++){
		for (j=0;j<y;j++){
			callback(i, j);
		}
	}
}

function isColorSimilar(a, b, color){

	var absDiff = Math.abs(a - b);

	if(typeof a === 'undefined'){
		return false;
	}
	if(typeof b === 'undefined'){
		return false;
	}

	if(a === b){
		return true;
	} else if ( absDiff < tolerance[color] ) {
		return true;
	} else {
		return false;
	}
}

function isPixelBrightnessSimilar(d1, d2){
	return Math.abs(d1.brightness - d2.brightness) < tolerance.minBrightness;
}

function getBrightness(r,g,b){
	return 0.3*r + 0.59*g + 0.11*b;
}

function isRGBSame(d1,d2){
	var red = d1.r === d2.r;
	var green = d1.g === d2.g;
	var blue = d1.b === d2.b;
	return red && green && blue;
}

function isRGBSimilar(d1, d2){
	var red = isColorSimilar(d1.r,d2.r,'red');
	var green = isColorSimilar(d1.g,d2.g,'green');
	var blue = isColorSimilar(d1.b,d2.b,'blue');

	return red && green && blue;
}

function isContrasting(d1, d2){
	return Math.abs(d1.brightness - d2.brightness) > tolerance.maxBrightness;
}

function getHue(r,g,b){

	r = r / 255;
	g = g / 255;
	b = b / 255;
	var max = Math.max(r, g, b), min = Math.min(r, g, b);
	var h;
	var d;

	if (max === min){
		h = 0; // achromatic
	} else{
		d = max - min;
		switch(max){
		case r:
			h = (g - b) / d + (g < b ? 6 : 0);
			break;
		case g:
			h = (b - r) / d + 2;
			break;
		case b:
			h = (r - g) / d + 4;
			break;
		}
		h /= 6;
	}

	return h;
}

function getPixelInfo(data, offset){
	var r;
	var g;
	var b;
	var d;

	if(typeof data[offset] !== 'undefined'){
		r = data[offset];
		g = data[offset+1];
		b = data[offset+2];
		d = {
			r: r,
			g: g,
			b: b
		};

		return d;
	} else {
		return null;
	}
}

function addBrightnessInfo(data){
	data.brightness = getBrightness(data.r,data.g,data.b); // 'corrected' lightness
}

function addHueInfo(data){
	data.h = getHue(data.r,data.g,data.b);
}

function isAntialiased(sourcePix, data, verticalPos, horizontalPos, width){
	var offset;
	var targetPix;
	var distance = 1;
	var i;
	var j;
	var hasHighContrastSibling = 0;
	var hasSiblingWithDifferentHue = 0;
	var hasEquivilantSibling = 0;
	var hasSourceHueInfo = false;

	for (i = distance*-1; i <= distance; i++){
		for (j = distance*-1; j <= distance; j++){

			if(i===0 && j===0){
				// ignore source pixel
				continue;
			}

			offset = ((verticalPos+j)*width + (horizontalPos+i)) * 4;
			targetPix = getPixelInfo(data, offset);

			if(targetPix === null){
				continue;
			}

			addBrightnessInfo(targetPix);

			if( isContrasting(sourcePix, targetPix) ){
				hasHighContrastSibling++;
			}

			if( hasHighContrastSibling > 1 ){
				return true; // return as early as possible
			}

			if(!hasSourceHueInfo){ // jit hue data on source
				addHueInfo(sourcePix);
				hasSourceHueInfo = true;
			}

			addHueInfo(targetPix);

			if( Math.abs(targetPix.h - sourcePix.h) > 0.3 ){
				hasSiblingWithDifferentHue++;
			}

			if( hasSiblingWithDifferentHue > 1 ){
				return true;
			}

			if( isRGBSame(sourcePix,targetPix) ){
				hasEquivilantSibling++;
			}
		}
	}

	if(hasEquivilantSibling < 2){
		return true;
	}

	return false;
}

function errorPixel(px, offset){
	px[offset] = 255; //r
	px[offset + 1] = 0; //g
	px[offset + 2] = 255; //b
	px[offset + 3] = 255; //a
}


var c = ['r', 'g', 'b', 'r']

function copyPixel(px, offset, data){

	data[c[index]] = 255;

	px[offset] = data.r; //r
	px[offset + 1] = data.g; //g
	px[offset + 2] = data.b; //b
	px[offset + 3] = 255; //a
}

function copyGrayScalePixel(px, offset, data){
	px[offset] = data.brightness; //r
	px[offset + 1] = data.brightness; //g
	px[offset + 2] = data.brightness; //b
	px[offset + 3] = 255; //a
}

function parseData(height, width, skip, data1, data2){

	var mismatchCount = 0;
	var targetPix = new Uint8ClampedArray(width*height*4);

	loop(height, width, function(verticalPos, horizontalPos){

		if(skip){ // only skip if the image isn't small
			if(verticalPos % skip === 0 || horizontalPos % skip === 0){
				return;
			}
		}

		var offset = (verticalPos*width + horizontalPos) * 4;
		var pixel1 = getPixelInfo(data1, offset);
		var pixel2 = getPixelInfo(data2, offset);

		if(pixel1 === null || pixel2 === null){
			return;
		}

		if (ignoreColors){

			addBrightnessInfo(pixel1);
			addBrightnessInfo(pixel2);

			if( isPixelBrightnessSimilar(pixel1, pixel2) ){
				copyGrayScalePixel(targetPix, offset, pixel2);
			} else {
				errorPixel(targetPix, offset);
				mismatchCount++;
			}
			return;
		}

		if( isRGBSimilar(pixel1, pixel2) ){
			copyPixel(targetPix, offset, pixel2);

		} else if( ignoreAntialiasing && (
				addBrightnessInfo(pixel1), // jit pixel info augmentation looks a little weird, sorry.
				addBrightnessInfo(pixel2),
				isAntialiased(pixel1, data1, verticalPos, horizontalPos, width) ||
				isAntialiased(pixel2, data2, verticalPos, horizontalPos, width)
			)){

			if( isPixelBrightnessSimilar(pixel1, pixel2) ){
				copyGrayScalePixel(targetPix, offset, pixel2);
			} else {
				errorPixel(targetPix, offset);
				mismatchCount++;
			}
		} else {
			errorPixel(targetPix, offset);
			mismatchCount++;
		}

	});

	return {
		data: targetPix,
		mismatch: mismatchCount
	};
}
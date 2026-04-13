#target illustrator

(function () {
  if (app.documents.length === 0) {
    alert("请先打开一个 Illustrator 文档。");
    return;
  }

  var doc = app.activeDocument;

  var rawInput = prompt(
    "请输入一行数字，用空格或逗号分隔。\n例如：\n82 64 95 40 71 58",
    ""
  );
  if (rawInput === null) return;

  var raw = rawInput.replace(/[\uFF0C\u3001；;|]/g, " ").split(/\s+/);
  var values = [];
  var i, num;

  for (i = 0; i < raw.length; i++) {
    if (!raw[i]) continue;
    num = Number(raw[i]);
    if (isNaN(num)) {
      alert("有无法识别的数字，请只输入数字。");
      return;
    }
    values.push(num);
  }

  if (values.length === 0) {
    alert("没有检测到数字。");
    return;
  }

  if (values.length > 15) {
    alert("最多支持 15 组数字。");
    return;
  }

  var MIN_SIZE = 12;
  var MAX_SIZE = 72;
  var GAP = 24;
  var SNAP = 1.5;

  function snapSize(size, step) {
    return Math.round(size / step) * step;
  }

  function scaleValue(value, minValue, maxValue, outMin, outMax) {
    if (maxValue === minValue) return (outMin + outMax) / 2;
    return outMin + (value - minValue) * (outMax - outMin) / (maxValue - minValue);
  }

  var minValue = values[0];
  var maxValue = values[0];
  for (i = 1; i < values.length; i++) {
    if (values[i] < minValue) minValue = values[i];
    if (values[i] > maxValue) maxValue = values[i];
  }

  var abIndex = doc.artboards.getActiveArtboardIndex();
  var ab = doc.artboards[abIndex].artboardRect; // [left, top, right, bottom]
  var left = ab[0];
  var top = ab[1];
  var right = ab[2];
  var bottom = ab[3];
  var centerY = (top + bottom) / 2;
  var cursorX = left + 40;
  var created = [];

  for (i = 0; i < values.length; i++) {
    var targetSize = scaleValue(values[i], minValue, maxValue, MIN_SIZE, MAX_SIZE);
    var finalSize = snapSize(targetSize, SNAP);
    if (finalSize < MIN_SIZE) finalSize = MIN_SIZE;
    if (finalSize > MAX_SIZE) finalSize = MAX_SIZE;

    var tf = doc.textFrames.pointText([cursorX, centerY]);
    tf.contents = String(values[i]);
    tf.textRange.characterAttributes.size = finalSize;
    created.push(tf);

    var bounds = tf.visibleBounds || tf.geometricBounds;
    var width = bounds[2] - bounds[0];
    cursorX += width + GAP;
  }

  if (created.length > 0) {
    var minLeft = null;
    var maxRight = null;
    for (i = 0; i < created.length; i++) {
      var b = created[i].visibleBounds || created[i].geometricBounds;
      if (minLeft === null || b[0] < minLeft) minLeft = b[0];
      if (maxRight === null || b[2] > maxRight) maxRight = b[2];
    }

    var artboardCenterX = (left + right) / 2;
    var textCenterX = (minLeft + maxRight) / 2;
    var shiftX = artboardCenterX - textCenterX;

    for (i = 0; i < created.length; i++) {
      created[i].left += shiftX;
    }
  }
})();

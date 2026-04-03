// wait in async functions: await wait(1000) // wait for 1 second
function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
// download a file with content, file name and content type
function download(content, fileName, contentType) {
    const a = document.createElement("a");
    const file = new Blob([content], { type: contentType });
    a.href = URL.createObjectURL(file);
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(a.href); // 释放内存
}
// copy content to clipboard (need user interaction)
function copyToClipboard(content) {
    navigator.clipboard.writeText(content).then(() => {
        alert('Copied to clipboard!');
    });
}

function isWeChat(){
    //window.navigator.userAgent属性包含了浏览器类型、版本、操作系统类型、浏览器引擎类型等信息，这个属性可以用来判断浏览器类型
    var ua = window.navigator.userAgent.toLowerCase();
    console.log(ua);
  //通过正则表达式匹配ua中是否含有MicroMessenger字符串
    if(ua.match(/MicroMessenger/i) == 'micromessenger'){
        return true;
    }else{
        return false;
    }
}
// Detect Internet Explorer (including IE11 and older IE versions)
var isIE = window.navigator.userAgent.toLowerCase().indexOf("msie") !== -1 ||
          window.navigator.userAgent.toLowerCase().indexOf("trident") !== -1;

if (isIE && !isWeChat()) {
    window.onload = function () {
        document.body.innerHTML = "都2026年了，您老人家还在用ie呢，您是老北京人吧！请您换成edge或chrome吧！";
    };
}

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
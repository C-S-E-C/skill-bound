/* ============================================
   Energy Page Script
   ============================================ */

// Display current energy
document.getElementById("me").innerHTML = "Current Energy: " + sessionStorage.getItem("energy");

// Fetch exchange rate from dynamic configuration
fetch("dynamic.json")
    .then(response => response.json())
    .then(data => {
        document.getElementById("ExchangeRate").innerHTML = 
            "1 CNY = <span style='font-size: 1.5rem;'>" + data.ExchangeRate + " Energy </span>";
    })
    .catch(err => {
        document.getElementById("ExchangeRate").innerText = "Unable to load exchange rate";
        console.error(err);
    });

// Redeem code function
function redeemCode() {
    const redeemCodeInput = document.getElementById("redeem-code");
    const code = redeemCodeInput.value;
    
    if (!code) {
        alert("Please enter a redemption code");
        return;
    }
    
    // TODO: Implement redemption logic with server
    console.log("Redeeming code:", code);
    alert("Code redemption feature coming soon");
}

// Attach event listener to redeem button
document.addEventListener('DOMContentLoaded', function() {
    const redeemBtn = document.getElementById("redeem-button");
    if (redeemBtn) {
        redeemBtn.addEventListener('click', redeemCode);
    }
});

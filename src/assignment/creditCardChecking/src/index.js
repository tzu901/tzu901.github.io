
function creditCardChecking() {
    
    const creditCardInput = document.getElementById('creditCard');
    const validationResult = document.getElementById('validation');
    const bank = document.getElementById('bank');
    const creditCard = document.getElementById('creditCard').value.replace(/-/g, '').replace(/ /g, '');
    console.log(creditCardInput.value);

    bank.textContent = ''
    if (creditCard == '') {
        validationResult.textContent = ''
        return;
    }
    // (creditCard[0] !== '3' && creditCard[0] !== '4' && creditCard[0] !== '5' || creditCard.length !== 16)
    if (creditCard[0] !== '3' && creditCard[0] !== '4' && creditCard[0] !== '5') {
        validationResult.textContent = 'Invalid';
        validationResult.style.color = 'red';
        console.log('Invalid');
        console.log('Credit card number should start with 3, 4 or 5');
        return;
    }

    if(creditCard.length !== 16) {
        validationResult.textContent = 'Invalid';
        validationResult.style.color = 'red';
        console.log('Credit card number should be 16 digits long');
        return;
    }
    
    let total = 0, odd = true;
    
    for (let i = creditCard.length - 1; i >= 0; i--) {
        let n = parseInt(creditCard[i], 10);

        if (!odd) {
            n *= 2;
            if (n > 9) {
                n -= 9;
            }
        }
        total += n;
        odd = !odd; 
    }
    
    if (total % 10 === 0) {
        validationResult.textContent = 'Valid';
        validationResult.style.color = 'green';
        console.log('Valid');
    } else {
        validationResult.textContent = 'Invalid';
        validationResult.style.color = 'red';
        console.log('Invalid');
        console.log('Credit card number total divided by 10 should be 0');
        return;
    }

    if (creditCard[0] == 3) {
        console.log('American Express or JCB');
        bank.textContent = 'American Express or JCB';
    } else if (creditCard[0] == 4) {
        console.log('Visa');
        bank.textContent = 'Visa';
    } else if (creditCard[0] == 5) {
        console.log('MasterCard');
        bank.textContent = 'MasterCard';
    }

}
    
document.getElementById('creditCard').addEventListener('change', function() {
    creditCardChecking();
});
    


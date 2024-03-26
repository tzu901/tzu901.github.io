
function creditCardChecking() {
    const creditCardInput = document.getElementById('creditCard');
    const validationResult = document.getElementById('validation');
    const creditCard = document.getElementById('creditCard').value.replace(/\D/g, '');

    if (creditCard[0] !== '3' && creditCard[0] !== '4' && creditCard[0] !== '5' || creditCard.length !== 16) {
        validationResult.textContent = 'Invalid';
        validationResult.style.color = 'red';
        return;
    }

    if (creditCard[0] == 3) {
        console.log('American Express or JCB');
    } else if (creditCard[0] == 4) {
        console.log('Visa');
    } else if (creditCard[0] == 5) {
        console.log('MasterCard');
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
    } else {
        validationResult.textContent = 'Invalid';
        validationResult.style.color = 'red';
    }
}
    
document.getElementById('creditCard').addEventListener('change', function() {
    creditCardChecking();
});
    


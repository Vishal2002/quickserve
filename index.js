import puppeteer from 'puppeteer';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';

class ZomatoCLI {
    constructor() {
        this.browser = null;
        this.page = null;
        this.isLoggedIn = false;
    }

    async initialize() {
        const spinner = ora('Launching browser...').start();
        try {
            this.browser = await puppeteer.launch({ headless: false });
            this.page = await this.browser.newPage();
            spinner.succeed('Browser launched successfully');
        } catch (error) {
            spinner.fail('Failed to launch browser');
            throw error;
        }
    }

    async login() {
        const spinner = ora('Opening Zomato...').start();
        try {
            await this.page.goto('https://www.zomato.com/', { waitUntil: 'networkidle0' });
            spinner.succeed('Loaded Zomato');

            // Login credentials prompt
            const credentials = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'phoneNumber',
                    message: 'Enter your phone number:',
                    validate: input => /^\d{10}$/.test(input) ? true : 'Please enter a valid 10-digit phone number'
                }
            ]);

            // Click login button and enter phone number
            await this.page.evaluate(() => {
                const loginLink = Array.from(document.querySelectorAll('a'))
                    .find(link => link.textContent.trim() === 'Log in');
                if (loginLink) loginLink.click();
            });

        
    
            // Clear any existing value and type phone number
            spinner.start('Entering phone number...');
            const phoneInput = await this.page.waitForSelector('.gmdLhr');
            await phoneInput.click({ clickCount: 3 }); // Select all existing text
            await phoneInput.press('Backspace'); // Clear any existing text
            await phoneInput.type(credentials.phoneNumber, { delay: 100 }); // Type with a slight delay
            spinner.succeed('Phone number entered');
            // Click send OTP button
            await this.page.click('button[tabindex="0"]');
            
            // OTP prompt
            const { otp } = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'otp',
                    message: 'Enter the OTP received:',
                    validate: input => /^\d{4,6}$/.test(input) ? true : 'Please enter a valid OTP'
                }
            ]);

            await this.page.type('input[type="number"][placeholder*="OTP"]', otp);
            await this.page.click('button.sc-1kx5g6g-1.bgDQms');

            // Wait for navigation after login
            await this.page.waitForNavigation({ waitUntil: 'networkidle0' });
            this.isLoggedIn = true;
            spinner.succeed('Login successful');
            return true;

        } catch (error) {
            spinner.fail('Login failed');
            console.error(chalk.red('Error during login:', error.message));
            return false;
        }
    }

    async searchLocation() {
        return inquirer.prompt([
            {
                type: 'input',
                name: 'location',
                message: 'Enter your delivery location:',
                validate: input => input.length >= 3 ? true : 'Please enter a valid location'
            }
        ]);
    }

    async showMainMenu() {
        return inquirer.prompt([
            {
                type: 'list',
                name: 'action',
                message: 'What would you like to do?',
                choices: [
                    { name: '🍽️  Order Food', value: 'ORDER_FOOD' },
                    { name: '📜  View Past Orders', value: 'VIEW_ORDERS' },
                    { name: '👤  My Profile', value: 'PROFILE' },
                    { name: '❌  Exit', value: 'EXIT' }
                ]
            }
        ]);
    }

    async selectCuisine() {
        return inquirer.prompt([
            {
                type: 'checkbox',
                name: 'cuisines',
                message: 'Select preferred cuisines:',
                choices: [
                    { name: '🇮🇳  Indian', value: 'indian' },
                    { name: '🍕  Italian', value: 'italian' },
                    { name: '🍜  Chinese', value: 'chinese' },
                    { name: '🍣  Japanese', value: 'japanese' },
                    { name: '🌮  Mexican', value: 'mexican' }
                ],
                validate: answer => answer.length > 0 ? true : 'Please select at least one cuisine'
            }
        ]);
    }

    async selectRestaurant(restaurants) {
        return inquirer.prompt([
            {
                type: 'list',
                name: 'restaurant',
                message: 'Select a restaurant:',
                choices: restaurants.map(restaurant => ({
                    name: `${restaurant.name} - ⭐ ${restaurant.rating} (${restaurant.deliveryTime} mins)`,
                    value: restaurant.id
                })),
                pageSize: 10
            }
        ]);
    }

    async selectDishes(menu) {
        const dishes = [];
        let addMore = true;

        while (addMore) {
            const answers = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'dish',
                    message: 'Select a dish:',
                    choices: menu.map(item => ({
                        name: `${item.name} - ₹${item.price} ${item.isVeg ? '🌱' : '🍖'}`,
                        value: item
                    })),
                    pageSize: 10
                },
                {
                    type: 'number',
                    name: 'quantity',
                    message: 'Enter quantity:',
                    default: 1,
                    validate: input => input > 0 ? true : 'Quantity must be greater than 0'
                }
            ]);

            dishes.push({
                ...answers.dish,
                quantity: answers.quantity
            });

            const { continue: shouldContinue } = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'continue',
                    message: 'Would you like to add more items?',
                    default: false
                }
            ]);

            addMore = shouldContinue;
        }

        return dishes;
    }

    async confirmOrder(dishes) {
        const total = dishes.reduce((sum, dish) => sum + (dish.price * dish.quantity), 0);
        
        console.log(chalk.yellow('\nOrder Summary:'));
        dishes.forEach(dish => {
            console.log(chalk.cyan(`${dish.name} x${dish.quantity} = ₹${dish.price * dish.quantity}`));
        });
        console.log(chalk.yellow(`\nTotal Amount: ₹${total}`));

        return inquirer.prompt([
            {
                type: 'confirm',
                name: 'confirm',
                message: 'Would you like to proceed with the order?',
                default: true
            }
        ]);
    }

    async processPayment() {
        return inquirer.prompt([
            {
                type: 'list',
                name: 'paymentMethod',
                message: 'Select payment method:',
                choices: [
                    { name: '💳  Credit/Debit Card', value: 'CARD' },
                    { name: '📱  UPI', value: 'UPI' },
                    { name: '💵  Cash on Delivery', value: 'COD' }
                ]
            }
        ]);
    }

    async handlePayment(method) {
        const spinner = ora('Processing payment...').start();
        try {
            // Simulate payment processing
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            if (method === 'UPI') {
                const { upiId } = await inquirer.prompt([
                    {
                        type: 'input',
                        name: 'upiId',
                        message: 'Enter your UPI ID:',
                        validate: input => /^[\w.-]+@[\w.-]+$/.test(input) ? true : 'Please enter a valid UPI ID'
                    }
                ]);
            }
            
            spinner.succeed('Payment processed successfully');
            return true;
        } catch (error) {
            spinner.fail('Payment failed');
            return false;
        }
    }

    async start() {
        try {
            await this.initialize();
            
            if (!await this.login()) {
                console.log(chalk.red('Failed to login. Exiting...'));
                return;
            }

            const { location } = await this.searchLocation();
            console.log(chalk.green(`Setting delivery location to: ${location}`));

            while (true) {
                const { action } = await this.showMainMenu();

                if (action === 'EXIT') {
                    break;
                }

                if (action === 'ORDER_FOOD') {
                    const { cuisines } = await this.selectCuisine();
                    
                    // Mock restaurant data
                    const restaurants = [
                        { id: 1, name: 'Tasty Bites', rating: 4.5, deliveryTime: 30 },
                        { id: 2, name: 'Spice Garden', rating: 4.2, deliveryTime: 40 },
                        { id: 3, name: 'Food Paradise', rating: 4.0, deliveryTime: 25 }
                    ];

                    const { restaurant } = await this.selectRestaurant(restaurants);

                    // Mock menu data
                    const menu = [
                        { id: 1, name: 'Butter Chicken', price: 300, isVeg: false },
                        { id: 2, name: 'Paneer Tikka', price: 250, isVeg: true },
                        { id: 3, name: 'Veg Biryani', price: 200, isVeg: true }
                    ];

                    const dishes = await this.selectDishes(menu);
                    const { confirm } = await this.confirmOrder(dishes);

                    if (confirm) {
                        const { paymentMethod } = await this.processPayment();
                        if (await this.handlePayment(paymentMethod)) {
                            console.log(chalk.green('\n🎉 Order placed successfully!'));
                            console.log(chalk.cyan('Your order will be delivered in 30-40 minutes.'));
                        }
                    }
                }
            }

        } catch (error) {
            console.error(chalk.red('An error occurred:', error.message));
        } finally {
            if (this.browser) {
                await this.browser.close();
            }
        }
    }
}

// Usage
const cli = new ZomatoCLI();
cli.start();
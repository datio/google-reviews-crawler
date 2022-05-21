const { chromium } = require("playwright");
const fs = require("fs");

let context;
let page;

const langPhrases = {
	en: {
		i_agree: 'I agree',
		sort: 'Sort',
		more: 'More',
	},
	el: {
		i_agree: 'Συμφωνώ',
		sort: 'Μεγαλύτερη συνάφεια',
		more: 'Περισσότερα',
	}
}

const lang = 'el';
const url = "https://www.google.com/maps/place/Infomax+Insurance+Brokers/@40.6731764,22.9063561,17z/data=!4m7!3m6!1s0x14a839f853f63187:0xe1ca6e18f0c38fcb!8m2!3d40.6731764!4d22.9085448!9m1!1b1?hl=" + lang;

(async () => {
	const browser = await chromium.launch({
		headless: false,
		devtools: false,
		ignoreDefaultArgs: ["--enable-automation"],
		args: [
			`--start-maximized`,
			`--no-default-browser-check`,
		],
	});

	context = await browser.newContext({
		userAgent:
			"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36",
	});

	page = await context.newPage();

	await new Promise((resolve) => setTimeout(resolve, 500));
	await page.setViewportSize({ width: 1920, height: 1057 });

	// Pass the Webdriver Test.
	await page.addInitScript(() => {
		const np = navigator.__proto__;
		delete np.webdriver;
		navigator.__proto__ = np;
	});

	await page.goto(
		url
	);

	try {
		await page.click('text=' + langPhrases[lang].i_agree, { timeout: 5000 });
	} catch (error) { }

	await viewExpandContent();
	let reviews = await getReviewsData();
	await saveReviews(reviews);

	await browser.close();
	console.log('check reviews.json for the result')
})();

const viewExpandContent = async () => {
	let scrollableReviewsContainer = await page.waitForSelector('[aria-label="Μεγαλύτερη συνάφεια"]');

	// first scroll only reloads/re-renders the containing reviews
	await scrollElToBottom(scrollableReviewsContainer);

	for (; ;) {
		try {
			await page.click('text=' + langPhrases[lang].sort, { timeout: 5000, clickCount: 3, delay: 200 });

			// wait for the custom dropdown select options popup
			await page.keyboard.press('ArrowDown');
			break;
		} catch (error) {
			continue;
		}
	}

	const dropdownElNewer = await page.waitForSelector("//ul[@role='menu']/li[@data-index='1']", { timeout: 5000 });
	await dropdownElNewer.click({ timeout: 5000, delay: 200 });

	await new Promise((resolve) => setTimeout(resolve, 1000));

	scrollableReviewsContainer = await page.waitForSelector("//button[contains(text(), '" + langPhrases[lang].more + "')]/../../../../../../..");

	let hitBottom = false;
	while (!hitBottom) {
		await scrollElToBottom(scrollableReviewsContainer);

		// wait for the network to pause
		await new Promise((resolve) => setTimeout(resolve, 500));
		await page.waitForLoadState('networkidle');

		hitBottom = await scrollableReviewsContainer.evaluate((el) => el.scrollHeight - el.scrollTop === el.clientHeight);
	}

	let expandTextEls = await scrollableReviewsContainer.$$("//button[contains(text(), '" + langPhrases[lang].more + "')]");

	for (let expandEl of expandTextEls) {
		await expandEl.click({ timeout: 5000, delay: 200 });
	}
};

const scrollElToBottom = async (el) => {
	await page.evaluate((el) => {
		el.scrollTo(0, el.scrollHeight);
	}, el);
}

const getReviewsData = async () => {
	let reviewData = await page.evaluate(() => {
		let els = document.querySelectorAll("a[href^='https://www.google.com/maps/contrib']:not([aria-label])");
		let reviewContentEls = [];
		for (let i = 0; i < els.length; i++) {
			reviewContentEls[i] = els[i].parentElement.parentElement.parentElement.parentElement;
		}

		let data = [];
		for (let i = 0; i < reviewContentEls.length; i++) {
			let dataObj = {
				id: reviewContentEls.length - i, // incremental, local id
				review_answer_date: null,
				review_answer_text: null,
				review_date: null, // relative string time in the language the page was rendered (?hl=el parameter value for Greek)
				review_likes: null,
				review_rating: null,
				review_text: null,
				review_url: null,
				reviewer_avatar: null,
				reviewer_name: null,
				reviewer_total_reviews: null,
			}

			try {
				dataObj.review_answer_date = document.evaluate(
					"./div[4]/div[9]/div[1]/span[2]",
					reviewContentEls[i],
					null,
					XPathResult.FIRST_ORDERED_NODE_TYPE,
					null
				).singleNodeValue.innerText;

				dataObj.review_answer_text = document.evaluate(
					"./div[4]/div[9]/div[2]",
					reviewContentEls[i],
					null,
					XPathResult.FIRST_ORDERED_NODE_TYPE,
					null
				).singleNodeValue.innerText;
			} catch (error) { }

			dataObj.review_date = document.evaluate(
				"./div[4]/div[1]/span[3]",
				reviewContentEls[i],
				null,
				XPathResult.FIRST_ORDERED_NODE_TYPE,
				null
			).singleNodeValue.innerText;

			try {
				dataObj.review_likes = document.evaluate(
					"./div[4]/div[8]/button[2]/span/span[2]",
					reviewContentEls[i],
					null,
					XPathResult.FIRST_ORDERED_NODE_TYPE,
					null
				).singleNodeValue.innerText;

				// https://stackoverflow.com/a/1611086
				let re = /^(-?\d*)[^0-9]*(\d*)\.([\s\S]*?)$/
				dataObj.review_likes = parseInt(dataObj.review_likes.replace(re, "$1$2"), 10);

				if (!dataObj.review_likes) {
					dataObj.review_likes = null
				}


			} catch (error) { }

			dataObj.review_url = document.evaluate(
				"./div[2]/div[2]/div/a",
				reviewContentEls[i],
				null,
				XPathResult.FIRST_ORDERED_NODE_TYPE,
				null
			).singleNodeValue.href;

			dataObj.reviewer_avatar = document.evaluate(
				".//img[contains(@src, 'googleusercontent')]",
				reviewContentEls[i],
				null,
				XPathResult.FIRST_ORDERED_NODE_TYPE,
				null
			).singleNodeValue.src;

			dataObj.reviewer_avatar = dataObj.reviewer_avatar.replace(/=.*$/g, '');

			dataObj.reviewer_name = document.evaluate(
				"./div[2]/div[2]/div/a/div",
				reviewContentEls[i],
				null,
				XPathResult.FIRST_ORDERED_NODE_TYPE,
				null
			).singleNodeValue.innerText;

			dataObj.review_rating = document.evaluate(
				//maps.gstatic.com/consumer/images/icons/2x/ic_star_rate_14.png
				//maps.gstatic.com/consumer/images/icons/2x/ic_star_rate_empty_14.png
				//maps.gstatic.com/consumer/images/icons/2x/ic_star_rate_half_14.png
				"count(.//img[contains(@src,'ic_star_rate_14.png')])", // might use aria-label in the future
				reviewContentEls[i],
				null,
				XPathResult.ANY_TYPE,
				null
			).numberValue;

			dataObj.review_text = document.evaluate(
				"./div[4]/div[2]",
				reviewContentEls[i],
				null,
				XPathResult.FIRST_ORDERED_NODE_TYPE,
				null
			).singleNodeValue.innerText;
			if (dataObj.review_text === "") {
				dataObj.review_text = null;
			}

			try {
				dataObj.reviewer_total_reviews = document.evaluate(
					"./div[2]/div[2]/div/a/div[2]",
					reviewContentEls[i],
					null,
					XPathResult.FIRST_ORDERED_NODE_TYPE,
					null
				).singleNodeValue.innerText;

				dataObj.reviewer_total_reviews = dataObj.reviewer_total_reviews.replace("・", "");
			} catch (error) { }

			data.push(dataObj);
		}

		return data;
	});

	return reviewData;
}

const saveReviews = async (reviews) => {
	fs.writeFileSync(
		require("path").join(__dirname, "reviews.json"),
		JSON.stringify(reviews)
	);
}
├── .env.example
├── .eslintrc.js
├── .github
    └── workflows
    │   ├── node.js.yml
    │   └── publish.yml
├── .prettierignore
├── .prettierrc
├── LICENSE
├── README.md
├── SampleAgent.js
├── jest.config.js
├── package-lock.json
├── package.json
├── rollup.config.mjs
├── src
    ├── .DS_Store
    ├── _module.ts
    ├── api-data.ts
    ├── api.ts
    ├── auth-user.ts
    ├── auth.test.ts
    ├── auth.ts
    ├── command.ts
    ├── errors.ts
    ├── grok.ts
    ├── messages.test.ts
    ├── messages.ts
    ├── platform
    │   ├── index.ts
    │   ├── node
    │   │   ├── index.ts
    │   │   └── randomize-ciphers.ts
    │   └── platform-interface.ts
    ├── profile.test.ts
    ├── profile.ts
    ├── relationships.test.ts
    ├── relationships.ts
    ├── requests.ts
    ├── scraper.test.ts
    ├── scraper.ts
    ├── search.test.ts
    ├── search.ts
    ├── spaces.ts
    ├── spaces
    │   ├── core
    │   │   ├── ChatClient.ts
    │   │   ├── JanusAudio.ts
    │   │   ├── JanusClient.ts
    │   │   ├── Space.ts
    │   │   └── SpaceParticipant.ts
    │   ├── logger.ts
    │   ├── plugins
    │   │   ├── HlsRecordPlugin.ts
    │   │   ├── IdleMonitorPlugin.ts
    │   │   ├── MonitorAudioPlugin.ts
    │   │   ├── RecordToDiskPlugin.ts
    │   │   └── SttTtsPlugin.ts
    │   ├── test.ts
    │   ├── testParticipant.ts
    │   ├── types.ts
    │   └── utils.ts
    ├── test-utils.ts
    ├── timeline-async.ts
    ├── timeline-following.ts
    ├── timeline-home.ts
    ├── timeline-list.ts
    ├── timeline-relationship.ts
    ├── timeline-search.ts
    ├── timeline-tweet-util.ts
    ├── timeline-v1.ts
    ├── timeline-v2.ts
    ├── trends.test.ts
    ├── trends.ts
    ├── tweets.test.ts
    ├── tweets.ts
    ├── type-util.ts
    └── types
    │   └── spaces.ts
├── test-assets
    ├── test-image.jpeg
    └── test-video.mp4
├── test-setup.js
├── tsconfig.json
└── typedoc.json


/.env.example:
--------------------------------------------------------------------------------
 1 | # for v1 api support
 2 | TWITTER_USERNAME=myaccount
 3 | TWITTER_PASSWORD=MyPassword!!!
 4 | TWITTER_EMAIL=myemail@gmail.com
 5 | 
 6 | # for v2 api support
 7 | TWITTER_API_KEY=key
 8 | TWITTER_API_SECRET_KEY=secret
 9 | TWITTER_ACCESS_TOKEN=token
10 | TWITTER_ACCESS_TOKEN_SECRET=tokensecret
11 | 
12 | # optional
13 | PROXY_URL=           # HTTP(s) proxy for requests
14 | 


--------------------------------------------------------------------------------
/.eslintrc.js:
--------------------------------------------------------------------------------
 1 | module.exports = {
 2 |   parser: '@typescript-eslint/parser',
 3 |   parserOptions: {
 4 |     tsconfigRootDir: __dirname,
 5 |     sourceType: 'module',
 6 |   },
 7 |   plugins: ['@typescript-eslint/eslint-plugin'],
 8 |   extends: [
 9 |     'plugin:@typescript-eslint/recommended',
10 |     'plugin:prettier/recommended',
11 |   ],
12 |   root: true,
13 |   env: {
14 |     node: true,
15 |     jest: true,
16 |   },
17 |   ignorePatterns: ['**/*.js'],
18 |   rules: {
19 |     '@typescript-eslint/interface-name-prefix': 'off',
20 |     '@typescript-eslint/explicit-function-return-type': 'off',
21 |     '@typescript-eslint/explicit-module-boundary-types': 'off',
22 |     '@typescript-eslint/no-explicit-any': 'off',
23 |   },
24 | };
25 | 


--------------------------------------------------------------------------------
/.github/workflows/node.js.yml:
--------------------------------------------------------------------------------
 1 | # This workflow will do a clean installation of node dependencies, cache/restore them, build the source code and run tests across different versions of node
 2 | # For more information see: https://help.github.com/actions/language-and-framework-guides/using-nodejs-with-github-actions
 3 | 
 4 | name: Node.js CI
 5 | 
 6 | on:
 7 |   push:
 8 |     branches: [main]
 9 | 
10 | jobs:
11 |   build:
12 |     runs-on: ubuntu-latest
13 |     steps:
14 |       - uses: actions/checkout@v3
15 |       - name: Install Node.js 20
16 |         uses: actions/setup-node@v3
17 |         with:
18 |           node-version: 20.x
19 |       - name: Install
20 |         run: npm install
21 |       # - name: Test
22 |       #   env:
23 |       #     TWITTER_USERNAME: ${{ secrets.TWITTER_USERNAME }}
24 |       #     TWITTER_PASSWORD: ${{ secrets.TWITTER_PASSWORD }}
25 |       #     TWITTER_EMAIL: ${{ secrets.TWITTER_EMAIL }}
26 |       #   run: npm run test
27 |       - name: Build
28 |         run: npm run build
29 | 


--------------------------------------------------------------------------------
/.github/workflows/publish.yml:
--------------------------------------------------------------------------------
 1 | name: Publish
 2 | 
 3 | on:
 4 |   release:
 5 |     types:
 6 |       - created
 7 | 
 8 | jobs:
 9 |   publish:
10 |     runs-on: ubuntu-latest
11 |     steps:
12 |       - uses: actions/checkout@v3
13 |       - name: Install Node.js
14 |         uses: actions/setup-node@v3
15 |         with:
16 |           node-version: 20.x
17 |       - name: Install
18 |         run: npm install
19 |       - name: Build
20 |         run: npm run build
21 |       - name: Configure Git
22 |         run: |
23 |             git config user.name "${{ github.actor }}"
24 |             git config user.email "${{ github.actor }}@users.noreply.github.com"
25 | 
26 |       - name: "Setup npm for npmjs"
27 |         run: |
28 |             npm config set registry https://registry.npmjs.org/
29 |             echo "//registry.npmjs.org/:_authToken=${{ secrets.NPM_TOKEN }}" > ~/.npmrc
30 |       - name: Publish
31 |         env:
32 |           NPM_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
33 |           NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
34 |         run: npm publish --access public
35 | 


--------------------------------------------------------------------------------
/.prettierignore:
--------------------------------------------------------------------------------
1 | node_modules/
2 | *.json


--------------------------------------------------------------------------------
/.prettierrc:
--------------------------------------------------------------------------------
1 | {
2 |     "singleQuote": true,
3 |     "trailingComma": "all",
4 |     "semi": true
5 | }


--------------------------------------------------------------------------------
/LICENSE:
--------------------------------------------------------------------------------
 1 | MIT License
 2 | 
 3 | Copyright (c) 2024 Ruby Research
 4 | Copyright (c) 2022 karashiiro
 5 | 
 6 | Permission is hereby granted, free of charge, to any person obtaining a copy
 7 | of this software and associated documentation files (the "Software"), to deal
 8 | in the Software without restriction, including without limitation the rights
 9 | to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
10 | copies of the Software, and to permit persons to whom the Software is
11 | furnished to do so, subject to the following conditions:
12 | 
13 | The above copyright notice and this permission notice shall be included in all
14 | copies or substantial portions of the Software.
15 | 
16 | THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
17 | IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
18 | FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
19 | AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
20 | LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
21 | OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
22 | SOFTWARE.
23 | 


--------------------------------------------------------------------------------
/README.md:
--------------------------------------------------------------------------------
  1 | # agent-twitter-client
  2 | 
  3 | This is a modified version of [@the-convocation/twitter-scraper](https://github.com/the-convocation/twitter-scraper) with added functionality for sending tweets and retweets. This package does not require the Twitter API to use and will run in both the browser and server.
  4 | 
  5 | ## Installation
  6 | 
  7 | ```sh
  8 | npm install agent-twitter-client
  9 | ```
 10 | 
 11 | ## Setup
 12 | 
 13 | Configure environment variables for authentication.
 14 | 
 15 | ```
 16 | TWITTER_USERNAME=    # Account username
 17 | TWITTER_PASSWORD=    # Account password
 18 | TWITTER_EMAIL=       # Account email
 19 | PROXY_URL=           # HTTP(s) proxy for requests (necessary for browsers)
 20 | 
 21 | # Twitter API v2 credentials for tweet and poll functionality
 22 | TWITTER_API_KEY=               # Twitter API Key
 23 | TWITTER_API_SECRET_KEY=        # Twitter API Secret Key
 24 | TWITTER_ACCESS_TOKEN=          # Access Token for Twitter API v2
 25 | TWITTER_ACCESS_TOKEN_SECRET=   # Access Token Secret for Twitter API v2
 26 | ```
 27 | 
 28 | ### Getting Twitter Cookies
 29 | 
 30 | It is important to use Twitter cookies to avoid sending a new login request to Twitter every time you want to perform an action.
 31 | 
 32 | In your application, you will likely want to check for existing cookies. If cookies are not available, log in with user authentication credentials and cache the cookies for future use.
 33 | 
 34 | ```ts
 35 | const scraper = await getScraper({ authMethod: 'password' });
 36 | 
 37 | scraper.getCookies().then((cookies) => {
 38 |   console.log(cookies);
 39 |   // Remove 'Cookies' and save the cookies as a JSON array
 40 | });
 41 | ```
 42 | 
 43 | ## Getting Started
 44 | 
 45 | ```ts
 46 | const scraper = new Scraper();
 47 | await scraper.login('username', 'password');
 48 | 
 49 | // If using v2 functionality (currently required to support polls)
 50 | await scraper.login(
 51 |   'username',
 52 |   'password',
 53 |   'email',
 54 |   'appKey',
 55 |   'appSecret',
 56 |   'accessToken',
 57 |   'accessSecret',
 58 | );
 59 | 
 60 | const tweets = await scraper.getTweets('elonmusk', 10);
 61 | const tweetsAndReplies = scraper.getTweetsAndReplies('elonmusk');
 62 | const latestTweet = await scraper.getLatestTweet('elonmusk');
 63 | const tweet = await scraper.getTweet('1234567890123456789');
 64 | await scraper.sendTweet('Hello world!');
 65 | 
 66 | // Create a poll
 67 | await scraper.sendTweetV2(
 68 |   `What's got you most hyped? Let us know! 🤖💸`,
 69 |   undefined,
 70 |   {
 71 |     poll: {
 72 |       options: [
 73 |         { label: 'AI Innovations 🤖' },
 74 |         { label: 'Crypto Craze 💸' },
 75 |         { label: 'Both! 🌌' },
 76 |         { label: 'Neither for Me 😅' },
 77 |       ],
 78 |       durationMinutes: 120, // Duration of the poll in minutes
 79 |     },
 80 |   },
 81 | );
 82 | ```
 83 | 
 84 | ### Fetching Specific Tweet Data (V2)
 85 | 
 86 | ```ts
 87 | // Fetch a single tweet with poll details
 88 | const tweet = await scraper.getTweetV2('1856441982811529619', {
 89 |   expansions: ['attachments.poll_ids'],
 90 |   pollFields: ['options', 'end_datetime'],
 91 | });
 92 | console.log('tweet', tweet);
 93 | 
 94 | // Fetch multiple tweets with poll and media details
 95 | const tweets = await scraper.getTweetsV2(
 96 |   ['1856441982811529619', '1856429655215260130'],
 97 |   {
 98 |     expansions: ['attachments.poll_ids', 'attachments.media_keys'],
 99 |     pollFields: ['options', 'end_datetime'],
100 |     mediaFields: ['url', 'preview_image_url'],
101 |   },
102 | );
103 | console.log('tweets', tweets);
104 | ```
105 | 
106 | ## API
107 | 
108 | ### Authentication
109 | 
110 | ```ts
111 | // Log in
112 | await scraper.login('username', 'password');
113 | 
114 | // Log out
115 | await scraper.logout();
116 | 
117 | // Check if logged in
118 | const isLoggedIn = await scraper.isLoggedIn();
119 | 
120 | // Get current session cookies
121 | const cookies = await scraper.getCookies();
122 | 
123 | // Set current session cookies
124 | await scraper.setCookies(cookies);
125 | 
126 | // Clear current cookies
127 | await scraper.clearCookies();
128 | ```
129 | 
130 | ### Profile
131 | 
132 | ```ts
133 | // Get a user's profile
134 | const profile = await scraper.getProfile('TwitterDev');
135 | 
136 | // Get a user ID from their screen name
137 | const userId = await scraper.getUserIdByScreenName('TwitterDev');
138 | 
139 | // Get logged-in user's profile
140 | const me = await scraper.me();
141 | ```
142 | 
143 | ### Search
144 | 
145 | ```ts
146 | import { SearchMode } from 'agent-twitter-client';
147 | 
148 | // Search for recent tweets
149 | const tweets = scraper.searchTweets('#nodejs', 20, SearchMode.Latest);
150 | 
151 | // Search for profiles
152 | const profiles = scraper.searchProfiles('John', 10);
153 | 
154 | // Fetch a page of tweet results
155 | const results = await scraper.fetchSearchTweets('#nodejs', 20, SearchMode.Top);
156 | 
157 | // Fetch a page of profile results
158 | const profileResults = await scraper.fetchSearchProfiles('John', 10);
159 | ```
160 | 
161 | ### Relationships
162 | 
163 | ```ts
164 | // Get a user's followers
165 | const followers = scraper.getFollowers('12345', 100);
166 | 
167 | // Get who a user is following
168 | const following = scraper.getFollowing('12345', 100);
169 | 
170 | // Fetch a page of a user's followers
171 | const followerResults = await scraper.fetchProfileFollowers('12345', 100);
172 | 
173 | // Fetch a page of who a user is following
174 | const followingResults = await scraper.fetchProfileFollowing('12345', 100);
175 | 
176 | // Follow a user
177 | const followUserResults = await scraper.followUser('elonmusk');
178 | ```
179 | 
180 | ### Trends
181 | 
182 | ```ts
183 | // Get current trends
184 | const trends = await scraper.getTrends();
185 | 
186 | // Fetch tweets from a list
187 | const listTweets = await scraper.fetchListTweets('1234567890', 50);
188 | ```
189 | 
190 | ### Tweets
191 | 
192 | ```ts
193 | // Get a user's tweets
194 | const tweets = scraper.getTweets('TwitterDev');
195 | 
196 | // Fetch the home timeline
197 | const homeTimeline = await scraper.fetchHomeTimeline(10, ['seenTweetId1','seenTweetId2']);
198 | 
199 | // Get a user's liked tweets
200 | const likedTweets = scraper.getLikedTweets('TwitterDev');
201 | 
202 | // Get a user's tweets and replies
203 | const tweetsAndReplies = scraper.getTweetsAndReplies('TwitterDev');
204 | 
205 | // Get tweets matching specific criteria
206 | const timeline = scraper.getTweets('TwitterDev', 100);
207 | const retweets = await scraper.getTweetsWhere(
208 |   timeline,
209 |   (tweet) => tweet.isRetweet,
210 | );
211 | 
212 | // Get a user's latest tweet
213 | const latestTweet = await scraper.getLatestTweet('TwitterDev');
214 | 
215 | // Get a specific tweet by ID
216 | const tweet = await scraper.getTweet('1234567890123456789');
217 | 
218 | // Send a tweet
219 | const sendTweetResults = await scraper.sendTweet('Hello world!');
220 | 
221 | // Send a quote tweet - Media files are optional
222 | const sendQuoteTweetResults = await scraper.sendQuoteTweet(
223 |   'Hello world!',
224 |   '1234567890123456789',
225 |   ['mediaFile1', 'mediaFile2'],
226 | );
227 | 
228 | // Retweet a tweet
229 | const retweetResults = await scraper.retweet('1234567890123456789');
230 | 
231 | // Like a tweet
232 | const likeTweetResults = await scraper.likeTweet('1234567890123456789');
233 | ```
234 | 
235 | ## Sending Tweets with Media
236 | 
237 | ### Media Handling
238 | 
239 | The scraper requires media files to be processed into a specific format before sending:
240 | 
241 | - Media must be converted to Buffer format
242 | - Each media file needs its MIME type specified
243 | - This helps the scraper distinguish between image and video processing models
244 | 
245 | ### Basic Tweet with Media
246 | 
247 | ```ts
248 | // Example: Sending a tweet with media attachments
249 | const mediaData = [
250 |   {
251 |     data: fs.readFileSync('path/to/image.jpg'),
252 |     mediaType: 'image/jpeg',
253 |   },
254 |   {
255 |     data: fs.readFileSync('path/to/video.mp4'),
256 |     mediaType: 'video/mp4',
257 |   },
258 | ];
259 | 
260 | await scraper.sendTweet('Hello world!', undefined, mediaData);
261 | ```
262 | 
263 | ### Supported Media Types
264 | 
265 | ```ts
266 | // Image formats and their MIME types
267 | const imageTypes = {
268 |   '.jpg': 'image/jpeg',
269 |   '.jpeg': 'image/jpeg',
270 |   '.png': 'image/png',
271 |   '.gif': 'image/gif',
272 | };
273 | 
274 | // Video format
275 | const videoTypes = {
276 |   '.mp4': 'video/mp4',
277 | };
278 | ```
279 | 
280 | ### Media Upload Limitations
281 | 
282 | - Maximum 4 images per tweet
283 | - Only 1 video per tweet
284 | - Maximum video file size: 512MB
285 | - Supported image formats: JPG, PNG, GIF
286 | - Supported video format: MP4
287 | 
288 | ## Grok Integration
289 | 
290 | This client provides programmatic access to Grok through Twitter's interface, offering a unique capability that even Grok's official API cannot match - access to real-time Twitter data. While Grok has a standalone API, only by interacting with Grok through Twitter can you leverage its ability to analyze and respond to live Twitter content. This makes it the only way to programmatically access an LLM with direct insight into Twitter's real-time information. [@grokkyAi](https://x.com/grokkyAi)
291 | 
292 | ### Basic Usage
293 | 
294 | ```ts
295 | const scraper = new Scraper();
296 | await scraper.login('username', 'password');
297 | 
298 | // Start a new conversation
299 | const response = await scraper.grokChat({
300 |   messages: [{ role: 'user', content: 'What are your thoughts on AI?' }],
301 | });
302 | 
303 | console.log(response.message); // Grok's response
304 | console.log(response.messages); // Full conversation history
305 | ```
306 | 
307 | If no `conversationId` is provided, the client will automatically create a new conversation.
308 | 
309 | ### Handling Rate Limits
310 | 
311 | Grok has rate limits of 25 messages every 2 hours for non-premium accounts. The client provides rate limit information in the response:
312 | 
313 | ```ts
314 | const response = await scraper.grokChat({
315 |   messages: [{ role: 'user', content: 'Hello!' }],
316 | });
317 | 
318 | if (response.rateLimit?.isRateLimited) {
319 |   console.log(response.rateLimit.message);
320 |   console.log(response.rateLimit.upsellInfo); // Premium upgrade information
321 | }
322 | ```
323 | 
324 | ### Response Types
325 | 
326 | The Grok integration includes TypeScript types for better development experience:
327 | 
328 | ```ts
329 | interface GrokChatOptions {
330 |   messages: GrokMessage[];
331 |   conversationId?: string;
332 |   returnSearchResults?: boolean;
333 |   returnCitations?: boolean;
334 | }
335 | 
336 | interface GrokChatResponse {
337 |   conversationId: string;
338 |   message: string;
339 |   messages: GrokMessage[];
340 |   webResults?: any[];
341 |   metadata?: any;
342 |   rateLimit?: GrokRateLimit;
343 | }
344 | ```
345 | 
346 | ### Advanced Usage
347 | 
348 | ```ts
349 | const response = await scraper.grokChat({
350 |   messages: [{ role: 'user', content: 'Research quantum computing' }],
351 |   returnSearchResults: true, // Include web search results
352 |   returnCitations: true, // Include citations for information
353 | });
354 | 
355 | // Access web results if available
356 | if (response.webResults) {
357 |   console.log('Sources:', response.webResults);
358 | }
359 | 
360 | // Full conversation with history
361 | console.log('Conversation:', response.messages);
362 | ```
363 | 
364 | ### Limitations
365 | 
366 | - Message history prefilling is currently limited due to unofficial API usage
367 | - Rate limits are enforced (25 messages/2 hours for non-premium)
368 | 


--------------------------------------------------------------------------------
/SampleAgent.js:
--------------------------------------------------------------------------------
 1 | import { Scraper } from 'agent-twitter-client';
 2 | import dotenv from 'dotenv';
 3 | dotenv.config();
 4 | 
 5 | async function main() {
 6 |   // const scraper = new Scraper();
 7 |   // // v1 login
 8 |   // await scraper.login(
 9 |   //   process.env.TWITTER_USERNAME,
10 |   //   process.env.TWITTER_PASSWORD,
11 |   // );
12 |   // // v2 login
13 |   // await scraper.login(
14 |   //   process.env.TWITTER_USERNAME,
15 |   //   process.env.TWITTER_PASSWORD,
16 |   //   undefined,
17 |   //   undefined,
18 |   //   process.env.TWITTER_API_KEY,
19 |   //   process.env.TWITTER_API_SECRET_KEY,
20 |   //   process.env.TWITTER_ACCESS_TOKEN,
21 |   //   process.env.TWITTER_ACCESS_TOKEN_SECRET,
22 |   // );
23 |   // console.log('Logged in successfully!');
24 |   // // Example: Posting a new tweet with a poll
25 |   // await scraper.sendTweetV2(
26 |   //   `When do you think we'll achieve AGI (Artificial General Intelligence)? 🤖 Cast your prediction!`,
27 |   //   undefined,
28 |   //   {
29 |   //     poll: {
30 |   //       options: [
31 |   //         { label: '2025 🗓️' },
32 |   //         { label: '2026 📅' },
33 |   //         { label: '2027 🛠️' },
34 |   //         { label: '2030+ 🚀' },
35 |   //       ],
36 |   //       durationMinutes: 1440,
37 |   //     },
38 |   //   },
39 |   // );
40 |   // console.log(await scraper.getTweet('1856441982811529619'));
41 |   // const tweet = await scraper.getTweetV2('1856441982811529619');
42 |   // console.log({ tweet });
43 |   // console.log('tweet', tweet);
44 |   // const tweets = await scraper.getTweetsV2([
45 |   //   '1856441982811529619',
46 |   //   '1856429655215260130',
47 |   // ]);
48 |   // console.log('tweets', tweets);
49 | }
50 | 
51 | main();
52 | 


--------------------------------------------------------------------------------
/jest.config.js:
--------------------------------------------------------------------------------
1 | /** @type {import('ts-jest').JestConfigWithTsJest} */
2 | module.exports = {
3 |   preset: 'ts-jest',
4 |   testEnvironment: 'node',
5 |   setupFiles: ['dotenv/config', './test-setup.js'],
6 | };
7 | 


--------------------------------------------------------------------------------
/package.json:
--------------------------------------------------------------------------------
 1 | {
 2 |   "name": "agent-twitter-client",
 3 |   "description": "A twitter client for agents",
 4 |   "keywords": [],
 5 |   "version": "0.0.18",
 6 |   "main": "dist/default/cjs/index.js",
 7 |   "types": "./dist/types/index.d.ts",
 8 |   "exports": {
 9 |     "types": "./dist/types/index.d.ts",
10 |     "node": {
11 |       "import": "./dist/node/esm/index.mjs",
12 |       "require": "./dist/node/cjs/index.cjs"
13 |     },
14 |     "default": {
15 |       "import": "./dist/default/esm/index.mjs",
16 |       "require": "./dist/default/cjs/index.js"
17 |     }
18 |   },
19 |   "author": "elizaOS",
20 |   "license": "MIT",
21 |   "scripts": {
22 |     "build": "rimraf dist && rollup -c",
23 |     "prepare": "npm run build",
24 |     "docs:generate": "typedoc --options typedoc.json",
25 |     "docs:deploy": "npm run docs:generate && gh-pages -d docs",
26 |     "format": "prettier --write src/**/*.ts",
27 |     "test": "jest"
28 |   },
29 |   "dependencies": {
30 |     "@roamhq/wrtc": "^0.8.0",
31 |     "@sinclair/typebox": "^0.32.20",
32 |     "headers-polyfill": "^3.1.2",
33 |     "json-stable-stringify": "^1.0.2",
34 |     "otpauth": "^9.2.2",
35 |     "set-cookie-parser": "^2.6.0",
36 |     "tough-cookie": "^4.1.2",
37 |     "twitter-api-v2": "^1.18.2",
38 |     "undici": "^7.1.1",
39 |     "undici-types": "^7.2.0",
40 |     "ws": "^8.18.0"
41 |   },
42 |   "devDependencies": {
43 |     "@commitlint/cli": "^17.6.3",
44 |     "@commitlint/config-conventional": "^17.6.3",
45 |     "@tsconfig/node16": "^16.1.3",
46 |     "@types/jest": "^29.5.1",
47 |     "@types/json-stable-stringify": "^1.0.34",
48 |     "@types/node": "^22.10.2",
49 |     "@types/set-cookie-parser": "^2.4.2",
50 |     "@types/tough-cookie": "^4.0.2",
51 |     "@types/ws": "^8.5.13",
52 |     "@typescript-eslint/eslint-plugin": "^5.59.7",
53 |     "@typescript-eslint/parser": "^5.59.7",
54 |     "dotenv": "^16.4.5",
55 |     "esbuild": "^0.21.5",
56 |     "eslint": "^8.41.0",
57 |     "eslint-config-prettier": "^8.8.0",
58 |     "eslint-plugin-prettier": "^4.2.1",
59 |     "gh-pages": "^5.0.0",
60 |     "jest": "^29.7.0",
61 |     "lint-staged": "^13.2.2",
62 |     "prettier": "^2.8.8",
63 |     "rimraf": "^5.0.7",
64 |     "rollup": "^4.18.0",
65 |     "rollup-plugin-dts": "^6.1.1",
66 |     "rollup-plugin-esbuild": "^6.1.1",
67 |     "ts-jest": "^29.1.0",
68 |     "typedoc": "^0.24.7",
69 |     "typescript": "^5.0.4"
70 |   },
71 |   "lint-staged": {
72 |     "*.{js,ts}": [
73 |       "eslint --cache --fix",
74 |       "prettier --write"
75 |     ]
76 |   }
77 | }


--------------------------------------------------------------------------------
/rollup.config.mjs:
--------------------------------------------------------------------------------
 1 | import dts from 'rollup-plugin-dts';
 2 | import esbuild from 'rollup-plugin-esbuild';
 3 | 
 4 | export default [
 5 |   {
 6 |     input: 'src/_module.ts',
 7 |     plugins: [
 8 |       esbuild({
 9 |         define: {
10 |           PLATFORM_NODE: 'false',
11 |           PLATFORM_NODE_JEST: 'false',
12 |         },
13 |       }),
14 |     ],
15 |     output: [
16 |       {
17 |         file: 'dist/default/cjs/index.js',
18 |         format: 'cjs',
19 |         sourcemap: true,
20 |       },
21 |       {
22 |         file: 'dist/default/esm/index.mjs',
23 |         format: 'es',
24 |         sourcemap: true,
25 |       },
26 |     ],
27 |   },
28 |   {
29 |     input: 'src/_module.ts',
30 |     plugins: [
31 |       esbuild({
32 |         define: {
33 |           PLATFORM_NODE: 'true',
34 |           PLATFORM_NODE_JEST: 'false',
35 |         },
36 |       }),
37 |     ],
38 |     output: [
39 |       {
40 |         file: 'dist/node/cjs/index.cjs',
41 |         format: 'cjs',
42 |         sourcemap: true,
43 |         inlineDynamicImports: true,
44 |       },
45 |       {
46 |         file: 'dist/node/esm/index.mjs',
47 |         format: 'es',
48 |         sourcemap: true,
49 |         inlineDynamicImports: true,
50 |       },
51 |     ],
52 |   },
53 |   {
54 |     input: 'src/_module.ts',
55 |     plugins: [dts()],
56 |     output: {
57 |       file: 'dist/types/index.d.ts',
58 |       format: 'es',
59 |     },
60 |   },
61 | ];
62 | 


--------------------------------------------------------------------------------
/src/.DS_Store:
--------------------------------------------------------------------------------
https://raw.githubusercontent.com/elizaOS/agent-twitter-client/fd5cb982c14c1ea75f30b2739ae9a9eb2d2ae394/src/.DS_Store


--------------------------------------------------------------------------------
/src/_module.ts:
--------------------------------------------------------------------------------
 1 | export type { Profile } from './profile';
 2 | export { Scraper } from './scraper';
 3 | export { SearchMode } from './search';
 4 | export type { QueryProfilesResponse, QueryTweetsResponse } from './timeline-v1';
 5 | export type { Tweet } from './tweets';
 6 | 
 7 | export { Space } from './spaces/core/Space';
 8 | export { SpaceParticipant } from './spaces/core/SpaceParticipant';
 9 | export { JanusClient } from './spaces/core/JanusClient';
10 | export { JanusAudioSink, JanusAudioSource } from './spaces/core/JanusAudio';
11 | export { ChatClient } from './spaces/core/ChatClient';
12 | export { Logger } from './spaces/logger';
13 | export { SttTtsPlugin } from './spaces/plugins/SttTtsPlugin';
14 | export { RecordToDiskPlugin } from './spaces/plugins/RecordToDiskPlugin';
15 | export { MonitorAudioPlugin } from './spaces/plugins/MonitorAudioPlugin';
16 | export { IdleMonitorPlugin } from './spaces/plugins/IdleMonitorPlugin';
17 | export { HlsRecordPlugin } from './spaces/plugins/HlsRecordPlugin';
18 | 
19 | export * from './types/spaces';
20 | export * from './spaces/types';
21 | 


--------------------------------------------------------------------------------
/src/api.ts:
--------------------------------------------------------------------------------
  1 | import { TwitterAuth } from './auth';
  2 | import { ApiError } from './errors';
  3 | import { Platform, PlatformExtensions } from './platform';
  4 | import { updateCookieJar } from './requests';
  5 | import { Headers } from 'headers-polyfill';
  6 | 
  7 | // For some reason using Parameters<typeof fetch> reduces the request transform function to
  8 | // `(url: string) => string` in tests.
  9 | type FetchParameters = [input: RequestInfo | URL, init?: RequestInit];
 10 | 
 11 | export interface FetchTransformOptions {
 12 |   /**
 13 |    * Transforms the request options before a request is made. This executes after all of the default
 14 |    * parameters have been configured, and is stateless. It is safe to return new request options
 15 |    * objects.
 16 |    * @param args The request options.
 17 |    * @returns The transformed request options.
 18 |    */
 19 |   request: (
 20 |     ...args: FetchParameters
 21 |   ) => FetchParameters | Promise<FetchParameters>;
 22 | 
 23 |   /**
 24 |    * Transforms the response after a request completes. This executes immediately after the request
 25 |    * completes, and is stateless. It is safe to return a new response object.
 26 |    * @param response The response object.
 27 |    * @returns The transformed response object.
 28 |    */
 29 |   response: (response: Response) => Response | Promise<Response>;
 30 | }
 31 | 
 32 | export const bearerToken =
 33 |   'AAAAAAAAAAAAAAAAAAAAAFQODgEAAAAAVHTp76lzh3rFzcHbmHVvQxYYpTw%3DckAlMINMjmCwxUcaXbAN4XqJVdgMJaHqNOFgPMK0zN1qLqLQCF';
 34 | 
 35 | /**
 36 |  * An API result container.
 37 |  */
 38 | export type RequestApiResult<T> =
 39 |   | { success: true; value: T }
 40 |   | { success: false; err: Error };
 41 | 
 42 | /**
 43 |  * Used internally to send HTTP requests to the Twitter API.
 44 |  * @internal
 45 |  * @param url - The URL to send the request to.
 46 |  * @param auth - The instance of {@link TwitterAuth} that will be used to authorize this request.
 47 |  * @param method - The HTTP method used when sending this request.
 48 |  */
 49 | export async function requestApi<T>(
 50 |   url: string,
 51 |   auth: TwitterAuth,
 52 |   method: 'GET' | 'POST' = 'GET',
 53 |   platform: PlatformExtensions = new Platform(),
 54 |   body?: any,
 55 | ): Promise<RequestApiResult<T>> {
 56 |   const headers = new Headers();
 57 |   await auth.installTo(headers, url);
 58 |   await platform.randomizeCiphers();
 59 | 
 60 |   let res: Response;
 61 |   do {
 62 |     try {
 63 |       res = await auth.fetch(url, {
 64 |         method,
 65 |         headers,
 66 |         credentials: 'include',
 67 |         ...(body && { body: JSON.stringify(body) }),
 68 |       });
 69 |     } catch (err) {
 70 |       if (!(err instanceof Error)) {
 71 |         throw err;
 72 |       }
 73 |       return {
 74 |         success: false,
 75 |         err: new Error('Failed to perform request.'),
 76 |       };
 77 |     }
 78 | 
 79 |     await updateCookieJar(auth.cookieJar(), res.headers);
 80 | 
 81 |     if (res.status === 429) {
 82 |       /*
 83 |       Known headers at this point:
 84 |       - x-rate-limit-limit: Maximum number of requests per time period?
 85 |       - x-rate-limit-reset: UNIX timestamp when the current rate limit will be reset.
 86 |       - x-rate-limit-remaining: Number of requests remaining in current time period?
 87 |       */
 88 |       const xRateLimitRemaining = res.headers.get('x-rate-limit-remaining');
 89 |       const xRateLimitReset = res.headers.get('x-rate-limit-reset');
 90 |       if (xRateLimitRemaining == '0' && xRateLimitReset) {
 91 |         const currentTime = new Date().valueOf() / 1000;
 92 |         const timeDeltaMs = 1000 * (parseInt(xRateLimitReset) - currentTime);
 93 | 
 94 |         // I have seen this block for 800s (~13 *minutes*)
 95 |         await new Promise((resolve) => setTimeout(resolve, timeDeltaMs));
 96 |       }
 97 |     }
 98 |   } while (res.status === 429);
 99 | 
100 |   if (!res.ok) {
101 |     return {
102 |       success: false,
103 |       err: await ApiError.fromResponse(res),
104 |     };
105 |   }
106 | 
107 |   // Check if response is chunked
108 |   const transferEncoding = res.headers.get('transfer-encoding');
109 |   if (transferEncoding === 'chunked') {
110 |     // Handle streaming response, if a reader is present
111 |     const reader = typeof res.body?.getReader === 'function' ? res.body.getReader() : null;
112 |     if (!reader) {
113 |       try {
114 |         const text = await res.text();
115 |         try {
116 |           const value = JSON.parse(text);
117 |           return { success: true, value };
118 |         } catch (e) {
119 |           // Return if just a normal string
120 |           return { success: true, value: { text } as any };
121 |         }
122 |       } catch (e) {
123 |         return {
124 |           success: false,
125 |           err: new Error('No readable stream available and cant parse'),
126 |         };
127 |       }
128 |     }
129 | 
130 |     let chunks: any = '';
131 |     // Read all chunks before attempting to parse
132 |     while (true) {
133 |       const { done, value } = await reader.read();
134 |       if (done) break;
135 | 
136 |       // Convert chunk to text and append
137 |       chunks += new TextDecoder().decode(value);
138 | 
139 |       // Log chunk for debugging (optional)
140 |       // console.log('Received chunk:', new TextDecoder().decode(value));
141 |     }
142 | 
143 |     // Now try to parse the complete accumulated response
144 |     try {
145 |       // console.log('attempting to parse chunks', chunks);
146 |       const value = JSON.parse(chunks);
147 |       return { success: true, value };
148 |     } catch (e) {
149 |       // console.log('parsing chunks failed, sending as raw text');
150 |       // If we can't parse as JSON, return the raw text
151 |       return { success: true, value: { text: chunks } as any };
152 |     }
153 |   }
154 | 
155 |   // Handle non-streaming responses as before
156 |   const contentType = res.headers.get('content-type');
157 |   if (contentType && contentType.includes('application/json')) {
158 |     const value: T = await res.json();
159 |     if (res.headers.get('x-rate-limit-incoming') == '0') {
160 |       auth.deleteToken();
161 |     }
162 |     return { success: true, value };
163 |   }
164 | 
165 |   return { success: true, value: {} as T };
166 | }
167 | 
168 | /** @internal */
169 | export function addApiFeatures(o: object) {
170 |   return {
171 |     ...o,
172 |     rweb_lists_timeline_redesign_enabled: true,
173 |     responsive_web_graphql_exclude_directive_enabled: true,
174 |     verified_phone_label_enabled: false,
175 |     creator_subscriptions_tweet_preview_api_enabled: true,
176 |     responsive_web_graphql_timeline_navigation_enabled: true,
177 |     responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
178 |     tweetypie_unmention_optimization_enabled: true,
179 |     responsive_web_edit_tweet_api_enabled: true,
180 |     graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
181 |     view_counts_everywhere_api_enabled: true,
182 |     longform_notetweets_consumption_enabled: true,
183 |     tweet_awards_web_tipping_enabled: false,
184 |     freedom_of_speech_not_reach_fetch_enabled: true,
185 |     standardized_nudges_misinfo: true,
186 |     longform_notetweets_rich_text_read_enabled: true,
187 |     responsive_web_enhance_cards_enabled: false,
188 |     subscriptions_verification_info_enabled: true,
189 |     subscriptions_verification_info_reason_enabled: true,
190 |     subscriptions_verification_info_verified_since_enabled: true,
191 |     super_follow_badge_privacy_enabled: false,
192 |     super_follow_exclusive_tweet_notifications_enabled: false,
193 |     super_follow_tweet_api_enabled: false,
194 |     super_follow_user_api_enabled: false,
195 |     android_graphql_skip_api_media_color_palette: false,
196 |     creator_subscriptions_subscription_count_enabled: false,
197 |     blue_business_profile_image_shape_enabled: false,
198 |     unified_cards_ad_metadata_container_dynamic_card_content_query_enabled:
199 |       false,
200 |   };
201 | }
202 | 
203 | export function addApiParams(
204 |   params: URLSearchParams,
205 |   includeTweetReplies: boolean,
206 | ): URLSearchParams {
207 |   params.set('include_profile_interstitial_type', '1');
208 |   params.set('include_blocking', '1');
209 |   params.set('include_blocked_by', '1');
210 |   params.set('include_followed_by', '1');
211 |   params.set('include_want_retweets', '1');
212 |   params.set('include_mute_edge', '1');
213 |   params.set('include_can_dm', '1');
214 |   params.set('include_can_media_tag', '1');
215 |   params.set('include_ext_has_nft_avatar', '1');
216 |   params.set('include_ext_is_blue_verified', '1');
217 |   params.set('include_ext_verified_type', '1');
218 |   params.set('skip_status', '1');
219 |   params.set('cards_platform', 'Web-12');
220 |   params.set('include_cards', '1');
221 |   params.set('include_ext_alt_text', 'true');
222 |   params.set('include_ext_limited_action_results', 'false');
223 |   params.set('include_quote_count', 'true');
224 |   params.set('include_reply_count', '1');
225 |   params.set('tweet_mode', 'extended');
226 |   params.set('include_ext_collab_control', 'true');
227 |   params.set('include_ext_views', 'true');
228 |   params.set('include_entities', 'true');
229 |   params.set('include_user_entities', 'true');
230 |   params.set('include_ext_media_color', 'true');
231 |   params.set('include_ext_media_availability', 'true');
232 |   params.set('include_ext_sensitive_media_warning', 'true');
233 |   params.set('include_ext_trusted_friends_metadata', 'true');
234 |   params.set('send_error_codes', 'true');
235 |   params.set('simple_quoted_tweet', 'true');
236 |   params.set('include_tweet_replies', `${includeTweetReplies}`);
237 |   params.set(
238 |     'ext',
239 |     'mediaStats,highlightedLabel,hasNftAvatar,voiceInfo,birdwatchPivot,enrichments,superFollowMetadata,unmentionInfo,editControl,collab_control,vibe',
240 |   );
241 |   return params;
242 | }
243 | 


--------------------------------------------------------------------------------
/src/auth-user.ts:
--------------------------------------------------------------------------------
  1 | import { TwitterAuthOptions, TwitterGuestAuth } from './auth';
  2 | import { requestApi } from './api';
  3 | import { CookieJar } from 'tough-cookie';
  4 | import { updateCookieJar } from './requests';
  5 | import { Headers } from 'headers-polyfill';
  6 | import { TwitterApiErrorRaw } from './errors';
  7 | import { Type, type Static } from '@sinclair/typebox';
  8 | import { Check } from '@sinclair/typebox/value';
  9 | import * as OTPAuth from 'otpauth';
 10 | import { LegacyUserRaw, parseProfile, type Profile } from './profile';
 11 | 
 12 | interface TwitterUserAuthFlowInitRequest {
 13 |   flow_name: string;
 14 |   input_flow_data: Record<string, unknown>;
 15 | }
 16 | 
 17 | interface TwitterUserAuthFlowSubtaskRequest {
 18 |   flow_token: string;
 19 |   subtask_inputs: ({
 20 |     subtask_id: string;
 21 |   } & Record<string, unknown>)[];
 22 | }
 23 | 
 24 | type TwitterUserAuthFlowRequest =
 25 |   | TwitterUserAuthFlowInitRequest
 26 |   | TwitterUserAuthFlowSubtaskRequest;
 27 | 
 28 | interface TwitterUserAuthFlowResponse {
 29 |   errors?: TwitterApiErrorRaw[];
 30 |   flow_token?: string;
 31 |   status?: string;
 32 |   subtasks?: TwitterUserAuthSubtask[];
 33 | }
 34 | 
 35 | interface TwitterUserAuthVerifyCredentials {
 36 |   errors?: TwitterApiErrorRaw[];
 37 | }
 38 | 
 39 | const TwitterUserAuthSubtask = Type.Object({
 40 |   subtask_id: Type.String(),
 41 |   enter_text: Type.Optional(Type.Object({})),
 42 | });
 43 | type TwitterUserAuthSubtask = Static<typeof TwitterUserAuthSubtask>;
 44 | 
 45 | type FlowTokenResultSuccess = {
 46 |   status: 'success';
 47 |   flowToken: string;
 48 |   subtask?: TwitterUserAuthSubtask;
 49 | };
 50 | 
 51 | type FlowTokenResult = FlowTokenResultSuccess | { status: 'error'; err: Error };
 52 | 
 53 | /**
 54 |  * A user authentication token manager.
 55 |  */
 56 | export class TwitterUserAuth extends TwitterGuestAuth {
 57 |   private userProfile: Profile | undefined;
 58 | 
 59 |   constructor(bearerToken: string, options?: Partial<TwitterAuthOptions>) {
 60 |     super(bearerToken, options);
 61 |   }
 62 | 
 63 |   async isLoggedIn(): Promise<boolean> {
 64 |     const res = await requestApi<TwitterUserAuthVerifyCredentials>(
 65 |       'https://api.twitter.com/1.1/account/verify_credentials.json',
 66 |       this,
 67 |     );
 68 |     if (!res.success) {
 69 |       return false;
 70 |     }
 71 | 
 72 |     const { value: verify } = res;
 73 |     this.userProfile = parseProfile(
 74 |       verify as LegacyUserRaw,
 75 |       (verify as unknown as { verified: boolean }).verified,
 76 |     );
 77 |     return verify && !verify.errors?.length;
 78 |   }
 79 | 
 80 |   async me(): Promise<Profile | undefined> {
 81 |     if (this.userProfile) {
 82 |       return this.userProfile;
 83 |     }
 84 |     await this.isLoggedIn();
 85 |     return this.userProfile;
 86 |   }
 87 | 
 88 |   async login(
 89 |     username: string,
 90 |     password: string,
 91 |     email?: string,
 92 |     twoFactorSecret?: string,
 93 |     appKey?: string,
 94 |     appSecret?: string,
 95 |     accessToken?: string,
 96 |     accessSecret?: string,
 97 |   ): Promise<void> {
 98 |     await this.updateGuestToken();
 99 | 
100 |     let next = await this.initLogin();
101 |     while ('subtask' in next && next.subtask) {
102 |       if (next.subtask.subtask_id === 'LoginJsInstrumentationSubtask') {
103 |         next = await this.handleJsInstrumentationSubtask(next);
104 |       } else if (next.subtask.subtask_id === 'LoginEnterUserIdentifierSSO') {
105 |         next = await this.handleEnterUserIdentifierSSO(next, username);
106 |       } else if (
107 |         next.subtask.subtask_id === 'LoginEnterAlternateIdentifierSubtask'
108 |       ) {
109 |         next = await this.handleEnterAlternateIdentifierSubtask(
110 |           next,
111 |           email as string,
112 |         );
113 |       } else if (next.subtask.subtask_id === 'LoginEnterPassword') {
114 |         next = await this.handleEnterPassword(next, password);
115 |       } else if (next.subtask.subtask_id === 'AccountDuplicationCheck') {
116 |         next = await this.handleAccountDuplicationCheck(next);
117 |       } else if (next.subtask.subtask_id === 'LoginTwoFactorAuthChallenge') {
118 |         if (twoFactorSecret) {
119 |           next = await this.handleTwoFactorAuthChallenge(next, twoFactorSecret);
120 |         } else {
121 |           throw new Error(
122 |             'Requested two factor authentication code but no secret provided',
123 |           );
124 |         }
125 |       } else if (next.subtask.subtask_id === 'LoginAcid') {
126 |         next = await this.handleAcid(next, email);
127 |       } else if (next.subtask.subtask_id === 'LoginSuccessSubtask') {
128 |         next = await this.handleSuccessSubtask(next);
129 |       } else {
130 |         throw new Error(`Unknown subtask ${next.subtask.subtask_id}`);
131 |       }
132 |     }
133 |     if (appKey && appSecret && accessToken && accessSecret) {
134 |       this.loginWithV2(appKey, appSecret, accessToken, accessSecret);
135 |     }
136 |     if ('err' in next) {
137 |       throw next.err;
138 |     }
139 |   }
140 | 
141 |   async logout(): Promise<void> {
142 |     if (!this.isLoggedIn()) {
143 |       return;
144 |     }
145 | 
146 |     await requestApi<void>(
147 |       'https://api.twitter.com/1.1/account/logout.json',
148 |       this,
149 |       'POST',
150 |     );
151 |     this.deleteToken();
152 |     this.jar = new CookieJar();
153 |   }
154 | 
155 |   async installCsrfToken(headers: Headers): Promise<void> {
156 |     const cookies = await this.getCookies();
157 |     const xCsrfToken = cookies.find((cookie) => cookie.key === 'ct0');
158 |     if (xCsrfToken) {
159 |       headers.set('x-csrf-token', xCsrfToken.value);
160 |     }
161 |   }
162 | 
163 |   async installTo(headers: Headers): Promise<void> {
164 |     headers.set('authorization', `Bearer ${this.bearerToken}`);
165 |     headers.set('cookie', await this.getCookieString());
166 |     await this.installCsrfToken(headers);
167 |   }
168 | 
169 |   private async initLogin() {
170 |     // Reset certain session-related cookies because Twitter complains sometimes if we don't
171 |     this.removeCookie('twitter_ads_id=');
172 |     this.removeCookie('ads_prefs=');
173 |     this.removeCookie('_twitter_sess=');
174 |     this.removeCookie('zipbox_forms_auth_token=');
175 |     this.removeCookie('lang=');
176 |     this.removeCookie('bouncer_reset_cookie=');
177 |     this.removeCookie('twid=');
178 |     this.removeCookie('twitter_ads_idb=');
179 |     this.removeCookie('email_uid=');
180 |     this.removeCookie('external_referer=');
181 |     this.removeCookie('ct0=');
182 |     this.removeCookie('aa_u=');
183 | 
184 |     return await this.executeFlowTask({
185 |       flow_name: 'login',
186 |       input_flow_data: {
187 |         flow_context: {
188 |           debug_overrides: {},
189 |           start_location: {
190 |             location: 'splash_screen',
191 |           },
192 |         },
193 |       },
194 |     });
195 |   }
196 | 
197 |   private async handleJsInstrumentationSubtask(prev: FlowTokenResultSuccess) {
198 |     return await this.executeFlowTask({
199 |       flow_token: prev.flowToken,
200 |       subtask_inputs: [
201 |         {
202 |           subtask_id: 'LoginJsInstrumentationSubtask',
203 |           js_instrumentation: {
204 |             response: '{}',
205 |             link: 'next_link',
206 |           },
207 |         },
208 |       ],
209 |     });
210 |   }
211 | 
212 |   private async handleEnterAlternateIdentifierSubtask(
213 |     prev: FlowTokenResultSuccess,
214 |     email: string,
215 |   ) {
216 |     return await this.executeFlowTask({
217 |       flow_token: prev.flowToken,
218 |       subtask_inputs: [
219 |         {
220 |           subtask_id: 'LoginEnterAlternateIdentifierSubtask',
221 |           enter_text: {
222 |             text: email,
223 |             link: 'next_link',
224 |           },
225 |         },
226 |       ],
227 |     });
228 |   }
229 | 
230 |   private async handleEnterUserIdentifierSSO(
231 |     prev: FlowTokenResultSuccess,
232 |     username: string,
233 |   ) {
234 |     return await this.executeFlowTask({
235 |       flow_token: prev.flowToken,
236 |       subtask_inputs: [
237 |         {
238 |           subtask_id: 'LoginEnterUserIdentifierSSO',
239 |           settings_list: {
240 |             setting_responses: [
241 |               {
242 |                 key: 'user_identifier',
243 |                 response_data: {
244 |                   text_data: { result: username },
245 |                 },
246 |               },
247 |             ],
248 |             link: 'next_link',
249 |           },
250 |         },
251 |       ],
252 |     });
253 |   }
254 | 
255 |   private async handleEnterPassword(
256 |     prev: FlowTokenResultSuccess,
257 |     password: string,
258 |   ) {
259 |     return await this.executeFlowTask({
260 |       flow_token: prev.flowToken,
261 |       subtask_inputs: [
262 |         {
263 |           subtask_id: 'LoginEnterPassword',
264 |           enter_password: {
265 |             password,
266 |             link: 'next_link',
267 |           },
268 |         },
269 |       ],
270 |     });
271 |   }
272 | 
273 |   private async handleAccountDuplicationCheck(prev: FlowTokenResultSuccess) {
274 |     return await this.executeFlowTask({
275 |       flow_token: prev.flowToken,
276 |       subtask_inputs: [
277 |         {
278 |           subtask_id: 'AccountDuplicationCheck',
279 |           check_logged_in_account: {
280 |             link: 'AccountDuplicationCheck_false',
281 |           },
282 |         },
283 |       ],
284 |     });
285 |   }
286 | 
287 |   private async handleTwoFactorAuthChallenge(
288 |     prev: FlowTokenResultSuccess,
289 |     secret: string,
290 |   ) {
291 |     const totp = new OTPAuth.TOTP({ secret });
292 |     let error;
293 |     for (let attempts = 1; attempts < 4; attempts += 1) {
294 |       try {
295 |         return await this.executeFlowTask({
296 |           flow_token: prev.flowToken,
297 |           subtask_inputs: [
298 |             {
299 |               subtask_id: 'LoginTwoFactorAuthChallenge',
300 |               enter_text: {
301 |                 link: 'next_link',
302 |                 text: totp.generate(),
303 |               },
304 |             },
305 |           ],
306 |         });
307 |       } catch (err) {
308 |         error = err;
309 |         await new Promise((resolve) => setTimeout(resolve, 2000 * attempts));
310 |       }
311 |     }
312 |     throw error;
313 |   }
314 | 
315 |   private async handleAcid(
316 |     prev: FlowTokenResultSuccess,
317 |     email: string | undefined,
318 |   ) {
319 |     return await this.executeFlowTask({
320 |       flow_token: prev.flowToken,
321 |       subtask_inputs: [
322 |         {
323 |           subtask_id: 'LoginAcid',
324 |           enter_text: {
325 |             text: email,
326 |             link: 'next_link',
327 |           },
328 |         },
329 |       ],
330 |     });
331 |   }
332 | 
333 |   private async handleSuccessSubtask(prev: FlowTokenResultSuccess) {
334 |     return await this.executeFlowTask({
335 |       flow_token: prev.flowToken,
336 |       subtask_inputs: [],
337 |     });
338 |   }
339 | 
340 |   private async executeFlowTask(
341 |     data: TwitterUserAuthFlowRequest,
342 |   ): Promise<FlowTokenResult> {
343 |     const onboardingTaskUrl =
344 |       'https://api.twitter.com/1.1/onboarding/task.json';
345 | 
346 |     const token = this.guestToken;
347 |     if (token == null) {
348 |       throw new Error('Authentication token is null or undefined.');
349 |     }
350 | 
351 |     const headers = new Headers({
352 |       authorization: `Bearer ${this.bearerToken}`,
353 |       cookie: await this.getCookieString(),
354 |       'content-type': 'application/json',
355 |       'User-Agent':
356 |         'Mozilla/5.0 (Linux; Android 11; Nokia G20) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.88 Mobile Safari/537.36',
357 |       'x-guest-token': token,
358 |       'x-twitter-auth-type': 'OAuth2Client',
359 |       'x-twitter-active-user': 'yes',
360 |       'x-twitter-client-language': 'en',
361 |     });
362 |     await this.installCsrfToken(headers);
363 | 
364 |     const res = await this.fetch(onboardingTaskUrl, {
365 |       credentials: 'include',
366 |       method: 'POST',
367 |       headers: headers,
368 |       body: JSON.stringify(data),
369 |     });
370 | 
371 |     await updateCookieJar(this.jar, res.headers);
372 | 
373 |     if (!res.ok) {
374 |       return { status: 'error', err: new Error(await res.text()) };
375 |     }
376 | 
377 |     const flow: TwitterUserAuthFlowResponse = await res.json();
378 |     if (flow?.flow_token == null) {
379 |       return { status: 'error', err: new Error('flow_token not found.') };
380 |     }
381 | 
382 |     if (flow.errors?.length) {
383 |       return {
384 |         status: 'error',
385 |         err: new Error(
386 |           `Authentication error (${flow.errors[0].code}): ${flow.errors[0].message}`,
387 |         ),
388 |       };
389 |     }
390 | 
391 |     if (typeof flow.flow_token !== 'string') {
392 |       return {
393 |         status: 'error',
394 |         err: new Error('flow_token was not a string.'),
395 |       };
396 |     }
397 | 
398 |     const subtask = flow.subtasks?.length ? flow.subtasks[0] : undefined;
399 |     Check(TwitterUserAuthSubtask, subtask);
400 | 
401 |     if (subtask && subtask.subtask_id === 'DenyLoginSubtask') {
402 |       return {
403 |         status: 'error',
404 |         err: new Error('Authentication error: DenyLoginSubtask'),
405 |       };
406 |     }
407 | 
408 |     return {
409 |       status: 'success',
410 |       subtask,
411 |       flowToken: flow.flow_token,
412 |     };
413 |   }
414 | }
415 | 


--------------------------------------------------------------------------------
/src/auth.test.ts:
--------------------------------------------------------------------------------
 1 | import { getScraper } from './test-utils';
 2 | 
 3 | const testLogin = process.env['TWITTER_PASSWORD'] ? test : test.skip;
 4 | 
 5 | testLogin(
 6 |   'scraper can log in',
 7 |   async () => {
 8 |     const scraper = await getScraper({ authMethod: 'password' });
 9 |     await expect(scraper.isLoggedIn()).resolves.toBeTruthy();
10 |   },
11 |   15000,
12 | );
13 | 
14 | test('scraper can log in with cookies', async () => {
15 |   const scraper = await getScraper();
16 |   await expect(scraper.isLoggedIn()).resolves.toBeTruthy();
17 | });
18 | 
19 | test('scraper can restore its login state from cookies', async () => {
20 |   const scraper = await getScraper();
21 |   await expect(scraper.isLoggedIn()).resolves.toBeTruthy();
22 |   const scraper2 = await getScraper({ authMethod: 'anonymous' });
23 |   await expect(scraper2.isLoggedIn()).resolves.toBeFalsy();
24 | 
25 |   const cookies = await scraper.getCookies();
26 |   await scraper2.setCookies(cookies);
27 | 
28 |   await expect(scraper2.isLoggedIn()).resolves.toBeTruthy();
29 | });
30 | 
31 | testLogin(
32 |   'scraper can log out',
33 |   async () => {
34 |     const scraper = await getScraper({ authMethod: 'password' });
35 |     await expect(scraper.isLoggedIn()).resolves.toBeTruthy();
36 | 
37 |     await scraper.logout();
38 | 
39 |     await expect(scraper.isLoggedIn()).resolves.toBeFalsy();
40 |   },
41 |   15000,
42 | );
43 | 


--------------------------------------------------------------------------------
/src/auth.ts:
--------------------------------------------------------------------------------
  1 | import { Cookie, CookieJar, MemoryCookieStore } from 'tough-cookie';
  2 | import { updateCookieJar } from './requests';
  3 | import { Headers } from 'headers-polyfill';
  4 | import { FetchTransformOptions } from './api';
  5 | import { TwitterApi } from 'twitter-api-v2';
  6 | import { Profile } from './profile';
  7 | 
  8 | export interface TwitterAuthOptions {
  9 |   fetch: typeof fetch;
 10 |   transform: Partial<FetchTransformOptions>;
 11 | }
 12 | 
 13 | export interface TwitterAuth {
 14 |   fetch: typeof fetch;
 15 | 
 16 |   /**
 17 |    * Returns the current cookie jar.
 18 |    */
 19 |   cookieJar(): CookieJar;
 20 | 
 21 |   /**
 22 |    * Logs into a Twitter account using the v2 API
 23 |    */
 24 |   loginWithV2(
 25 |     appKey: string,
 26 |     appSecret: string,
 27 |     accessToken: string,
 28 |     accessSecret: string,
 29 |   ): void;
 30 | 
 31 |   /**
 32 |    * Get v2 API client if it exists
 33 |    */
 34 |   getV2Client(): TwitterApi | null;
 35 | 
 36 |   /**
 37 |    * Returns if a user is logged-in to Twitter through this instance.
 38 |    * @returns `true` if a user is logged-in; otherwise `false`.
 39 |    */
 40 |   isLoggedIn(): Promise<boolean>;
 41 | 
 42 |   /**
 43 |    * Fetches the current user's profile.
 44 |    */
 45 |   me(): Promise<Profile | undefined>;
 46 | 
 47 |   /**
 48 |    * Logs into a Twitter account.
 49 |    * @param username The username to log in with.
 50 |    * @param password The password to log in with.
 51 |    * @param email The email to log in with, if you have email confirmation enabled.
 52 |    * @param twoFactorSecret The secret to generate two factor authentication tokens with, if you have two factor authentication enabled.
 53 |    */
 54 |   login(
 55 |     username: string,
 56 |     password: string,
 57 |     email?: string,
 58 |     twoFactorSecret?: string,
 59 |   ): Promise<void>;
 60 | 
 61 |   /**
 62 |    * Logs out of the current session.
 63 |    */
 64 |   logout(): Promise<void>;
 65 | 
 66 |   /**
 67 |    * Deletes the current guest token token.
 68 |    */
 69 |   deleteToken(): void;
 70 | 
 71 |   /**
 72 |    * Returns if the authentication state has a token.
 73 |    * @returns `true` if the authentication state has a token; `false` otherwise.
 74 |    */
 75 |   hasToken(): boolean;
 76 | 
 77 |   /**
 78 |    * Returns the time that authentication was performed.
 79 |    * @returns The time at which the authentication token was created, or `null` if it hasn't been created yet.
 80 |    */
 81 |   authenticatedAt(): Date | null;
 82 | 
 83 |   /**
 84 |    * Installs the authentication information into a headers-like object. If needed, the
 85 |    * authentication token will be updated from the API automatically.
 86 |    * @param headers A Headers instance representing a request's headers.
 87 |    */
 88 |   installTo(headers: Headers, url: string): Promise<void>;
 89 | }
 90 | 
 91 | /**
 92 |  * Wraps the provided fetch function with transforms.
 93 |  * @param fetchFn The fetch function.
 94 |  * @param transform The transform options.
 95 |  * @returns The input fetch function, wrapped with the provided transforms.
 96 |  */
 97 | function withTransform(
 98 |   fetchFn: typeof fetch,
 99 |   transform?: Partial<FetchTransformOptions>,
100 | ): typeof fetch {
101 |   return async (input, init) => {
102 |     const fetchArgs = (await transform?.request?.(input, init)) ?? [
103 |       input,
104 |       init,
105 |     ];
106 |     const res = await fetchFn(...fetchArgs);
107 |     return (await transform?.response?.(res)) ?? res;
108 |   };
109 | }
110 | 
111 | /**
112 |  * A guest authentication token manager. Automatically handles token refreshes.
113 |  */
114 | export class TwitterGuestAuth implements TwitterAuth {
115 |   protected bearerToken: string;
116 |   protected jar: CookieJar;
117 |   protected guestToken?: string;
118 |   protected guestCreatedAt?: Date;
119 |   protected v2Client: TwitterApi | null;
120 | 
121 |   fetch: typeof fetch;
122 | 
123 |   constructor(
124 |     bearerToken: string,
125 |     protected readonly options?: Partial<TwitterAuthOptions>,
126 |   ) {
127 |     this.fetch = withTransform(options?.fetch ?? fetch, options?.transform);
128 |     this.bearerToken = bearerToken;
129 |     this.jar = new CookieJar();
130 |     this.v2Client = null;
131 |   }
132 | 
133 |   cookieJar(): CookieJar {
134 |     return this.jar;
135 |   }
136 | 
137 |   getV2Client(): TwitterApi | null {
138 |     return this.v2Client ?? null;
139 |   }
140 | 
141 |   loginWithV2(
142 |     appKey: string,
143 |     appSecret: string,
144 |     accessToken: string,
145 |     accessSecret: string,
146 |   ): void {
147 |     const v2Client = new TwitterApi({
148 |       appKey,
149 |       appSecret,
150 |       accessToken,
151 |       accessSecret,
152 |     });
153 |     this.v2Client = v2Client;
154 |   }
155 | 
156 |   isLoggedIn(): Promise<boolean> {
157 |     return Promise.resolve(false);
158 |   }
159 | 
160 |   async me(): Promise<Profile | undefined> {
161 |     return undefined;
162 |   }
163 | 
164 |   // eslint-disable-next-line @typescript-eslint/no-unused-vars
165 |   login(_username: string, _password: string, _email?: string): Promise<void> {
166 |     return this.updateGuestToken();
167 |   }
168 | 
169 |   logout(): Promise<void> {
170 |     this.deleteToken();
171 |     this.jar = new CookieJar();
172 |     return Promise.resolve();
173 |   }
174 | 
175 |   deleteToken() {
176 |     delete this.guestToken;
177 |     delete this.guestCreatedAt;
178 |   }
179 | 
180 |   hasToken(): boolean {
181 |     return this.guestToken != null;
182 |   }
183 | 
184 |   authenticatedAt(): Date | null {
185 |     if (this.guestCreatedAt == null) {
186 |       return null;
187 |     }
188 | 
189 |     return new Date(this.guestCreatedAt);
190 |   }
191 | 
192 |   async installTo(headers: Headers): Promise<void> {
193 |     if (this.shouldUpdate()) {
194 |       await this.updateGuestToken();
195 |     }
196 | 
197 |     const token = this.guestToken;
198 |     if (token == null) {
199 |       throw new Error('Authentication token is null or undefined.');
200 |     }
201 | 
202 |     headers.set('authorization', `Bearer ${this.bearerToken}`);
203 |     headers.set('x-guest-token', token);
204 | 
205 |     const cookies = await this.getCookies();
206 |     const xCsrfToken = cookies.find((cookie) => cookie.key === 'ct0');
207 |     if (xCsrfToken) {
208 |       headers.set('x-csrf-token', xCsrfToken.value);
209 |     }
210 | 
211 |     headers.set('cookie', await this.getCookieString());
212 |   }
213 | 
214 |   protected getCookies(): Promise<Cookie[]> {
215 |     return this.jar.getCookies(this.getCookieJarUrl());
216 |   }
217 | 
218 |   protected getCookieString(): Promise<string> {
219 |     return this.jar.getCookieString(this.getCookieJarUrl());
220 |   }
221 | 
222 |   protected async removeCookie(key: string): Promise<void> {
223 |     //@ts-expect-error don't care
224 |     const store: MemoryCookieStore = this.jar.store;
225 |     const cookies = await this.jar.getCookies(this.getCookieJarUrl());
226 |     for (const cookie of cookies) {
227 |       if (!cookie.domain || !cookie.path) continue;
228 |       store.removeCookie(cookie.domain, cookie.path, key);
229 | 
230 |       if (typeof document !== 'undefined') {
231 |         document.cookie = `${cookie.key}=; Max-Age=0; path=${cookie.path}; domain=${cookie.domain}`;
232 |       }
233 |     }
234 |   }
235 | 
236 |   private getCookieJarUrl(): string {
237 |     return typeof document !== 'undefined'
238 |       ? document.location.toString()
239 |       : 'https://twitter.com';
240 |   }
241 | 
242 |   /**
243 |    * Updates the authentication state with a new guest token from the Twitter API.
244 |    */
245 |   protected async updateGuestToken() {
246 |     const guestActivateUrl = 'https://api.twitter.com/1.1/guest/activate.json';
247 | 
248 |     const headers = new Headers({
249 |       Authorization: `Bearer ${this.bearerToken}`,
250 |       Cookie: await this.getCookieString(),
251 |     });
252 | 
253 |     const res = await this.fetch(guestActivateUrl, {
254 |       method: 'POST',
255 |       headers: headers,
256 |       referrerPolicy: 'no-referrer',
257 |     });
258 | 
259 |     await updateCookieJar(this.jar, res.headers);
260 | 
261 |     if (!res.ok) {
262 |       throw new Error(await res.text());
263 |     }
264 | 
265 |     const o = await res.json();
266 |     if (o == null || o['guest_token'] == null) {
267 |       throw new Error('guest_token not found.');
268 |     }
269 | 
270 |     const newGuestToken = o['guest_token'];
271 |     if (typeof newGuestToken !== 'string') {
272 |       throw new Error('guest_token was not a string.');
273 |     }
274 | 
275 |     this.guestToken = newGuestToken;
276 |     this.guestCreatedAt = new Date();
277 |   }
278 | 
279 |   /**
280 |    * Returns if the authentication token needs to be updated or not.
281 |    * @returns `true` if the token needs to be updated; `false` otherwise.
282 |    */
283 |   private shouldUpdate(): boolean {
284 |     return (
285 |       !this.hasToken() ||
286 |       (this.guestCreatedAt != null &&
287 |         this.guestCreatedAt <
288 |           new Date(new Date().valueOf() - 3 * 60 * 60 * 1000))
289 |     );
290 |   }
291 | }
292 | 


--------------------------------------------------------------------------------
/src/errors.ts:
--------------------------------------------------------------------------------
 1 | export class ApiError extends Error {
 2 |   private constructor(
 3 |     readonly response: Response,
 4 |     readonly data: any,
 5 |     message: string,
 6 |   ) {
 7 |     super(message);
 8 |   }
 9 | 
10 |   static async fromResponse(response: Response) {
11 |     // Try our best to parse the result, but don't bother if we can't
12 |     let data: string | object | undefined = undefined;
13 |     try {
14 |       data = await response.json();
15 |     } catch {
16 |       try {
17 |         data = await response.text();
18 |       } catch {}
19 |     }
20 | 
21 |     return new ApiError(response, data, `Response status: ${response.status}`);
22 |   }
23 | }
24 | 
25 | interface Position {
26 |   line: number;
27 |   column: number;
28 | }
29 | 
30 | interface TraceInfo {
31 |   trace_id: string;
32 | }
33 | 
34 | interface TwitterApiErrorExtensions {
35 |   code?: number;
36 |   kind?: string;
37 |   name?: string;
38 |   source?: string;
39 |   tracing?: TraceInfo;
40 | }
41 | 
42 | export interface TwitterApiErrorRaw extends TwitterApiErrorExtensions {
43 |   message?: string;
44 |   locations?: Position[];
45 |   path?: string[];
46 |   extensions?: TwitterApiErrorExtensions;
47 | }
48 | 


--------------------------------------------------------------------------------
/src/grok.ts:
--------------------------------------------------------------------------------
  1 | import { requestApi } from './api';
  2 | import { TwitterAuth } from './auth';
  3 | 
  4 | export interface GrokConversation {
  5 |   data: {
  6 |     create_grok_conversation: {
  7 |       conversation_id: string;
  8 |     };
  9 |   };
 10 | }
 11 | 
 12 | export interface GrokRequest {
 13 |   responses: GrokResponseMessage[];
 14 |   systemPromptName: string;
 15 |   grokModelOptionId: string;
 16 |   conversationId: string;
 17 |   returnSearchResults: boolean;
 18 |   returnCitations: boolean;
 19 |   promptMetadata: {
 20 |     promptSource: string;
 21 |     action: string;
 22 |   };
 23 |   imageGenerationCount: number;
 24 |   requestFeatures: {
 25 |     eagerTweets: boolean;
 26 |     serverHistory: boolean;
 27 |   };
 28 | }
 29 | 
 30 | // Types for the user-facing API
 31 | export interface GrokMessage {
 32 |   role: 'user' | 'assistant';
 33 |   content: string;
 34 | }
 35 | 
 36 | export interface GrokChatOptions {
 37 |   messages: GrokMessage[];
 38 |   conversationId?: string; // Optional - will create new if not provided
 39 |   returnSearchResults?: boolean;
 40 |   returnCitations?: boolean;
 41 | }
 42 | 
 43 | // Internal types for API requests
 44 | export interface GrokResponseMessage {
 45 |   message: string;
 46 |   sender: 1 | 2; // 1 = user, 2 = assistant
 47 |   promptSource?: string;
 48 |   fileAttachments?: any[];
 49 | }
 50 | 
 51 | // Rate limit information
 52 | export interface GrokRateLimit {
 53 |   isRateLimited: boolean;
 54 |   message: string;
 55 |   upsellInfo?: {
 56 |     usageLimit: string;
 57 |     quotaDuration: string;
 58 |     title: string;
 59 |     message: string;
 60 |   };
 61 | }
 62 | 
 63 | export interface GrokChatResponse {
 64 |   conversationId: string;
 65 |   message: string;
 66 |   messages: GrokMessage[];
 67 |   webResults?: any[];
 68 |   metadata?: any;
 69 |   rateLimit?: GrokRateLimit;
 70 | }
 71 | 
 72 | /**
 73 |  * Creates a new conversation with Grok.
 74 |  * @returns The ID of the newly created conversation
 75 |  * @internal
 76 |  */
 77 | export async function createGrokConversation(
 78 |   auth: TwitterAuth,
 79 | ): Promise<string> {
 80 |   const res = await requestApi<GrokConversation>(
 81 |     'https://x.com/i/api/graphql/6cmfJY3d7EPWuCSXWrkOFg/CreateGrokConversation',
 82 |     auth,
 83 |     'POST',
 84 |   );
 85 | 
 86 |   if (!res.success) {
 87 |     throw res.err;
 88 |   }
 89 | 
 90 |   return res.value.data.create_grok_conversation.conversation_id;
 91 | }
 92 | 
 93 | /**
 94 |  * Main method for interacting with Grok in a chat-like manner.
 95 |  */
 96 | export async function grokChat(
 97 |   options: GrokChatOptions,
 98 |   auth: TwitterAuth,
 99 | ): Promise<GrokChatResponse> {
100 |   let { conversationId, messages } = options;
101 | 
102 |   // Create new conversation if none provided
103 |   if (!conversationId) {
104 |     conversationId = await createGrokConversation(auth);
105 |   }
106 | 
107 |   // Convert OpenAI-style messages to Grok's internal format
108 |   const responses: GrokResponseMessage[] = messages.map((msg: GrokMessage) => ({
109 |     message: msg.content,
110 |     sender: msg.role === 'user' ? 1 : 2,
111 |     ...(msg.role === 'user' && {
112 |       promptSource: '',
113 |       fileAttachments: [],
114 |     }),
115 |   }));
116 | 
117 |   const payload: GrokRequest = {
118 |     responses,
119 |     systemPromptName: '',
120 |     grokModelOptionId: 'grok-2a',
121 |     conversationId,
122 |     returnSearchResults: options.returnSearchResults ?? true,
123 |     returnCitations: options.returnCitations ?? true,
124 |     promptMetadata: {
125 |       promptSource: 'NATURAL',
126 |       action: 'INPUT',
127 |     },
128 |     imageGenerationCount: 4,
129 |     requestFeatures: {
130 |       eagerTweets: true,
131 |       serverHistory: true,
132 |     },
133 |   };
134 | 
135 |   const res = await requestApi<{ text: string }>(
136 |     'https://api.x.com/2/grok/add_response.json',
137 |     auth,
138 |     'POST',
139 |     undefined,
140 |     payload,
141 |   );
142 | 
143 |   if (!res.success) {
144 |     throw res.err;
145 |   }
146 | 
147 |   // Parse response chunks - Grok may return either a single response or multiple chunks
148 |   let chunks: any[];
149 |   if (res.value.text) {
150 |     // For streaming responses, split text into chunks and parse each JSON chunk
151 |     chunks = res.value.text
152 |       .split('\n')
153 |       .filter(Boolean)
154 |       .map((chunk: any) => JSON.parse(chunk));
155 |   } else {
156 |     // For single responses (like rate limiting), wrap in array
157 |     chunks = [res.value];
158 |   }
159 | 
160 |   // Check if we hit rate limits by examining first chunk
161 |   const firstChunk = chunks[0];
162 |   if (firstChunk.result?.responseType === 'limiter') {
163 |     return {
164 |       conversationId,
165 |       message: firstChunk.result.message,
166 |       messages: [
167 |         ...messages,
168 |         { role: 'assistant', content: firstChunk.result.message },
169 |       ],
170 |       rateLimit: {
171 |         isRateLimited: true,
172 |         message: firstChunk.result.message,
173 |         upsellInfo: firstChunk.result.upsell
174 |           ? {
175 |               usageLimit: firstChunk.result.upsell.usageLimit,
176 |               quotaDuration: `${firstChunk.result.upsell.quotaDurationCount} ${firstChunk.result.upsell.quotaDurationPeriod}`,
177 |               title: firstChunk.result.upsell.title,
178 |               message: firstChunk.result.upsell.message,
179 |             }
180 |           : undefined,
181 |       },
182 |     };
183 |   }
184 | 
185 |   // Combine all message chunks into single response
186 |   const fullMessage = chunks
187 |     .filter((chunk: any) => chunk.result?.message)
188 |     .map((chunk: any) => chunk.result.message)
189 |     .join('');
190 | 
191 |   // Return complete response with conversation history and metadata
192 |   return {
193 |     conversationId,
194 |     message: fullMessage,
195 |     messages: [...messages, { role: 'assistant', content: fullMessage }],
196 |     webResults: chunks.find((chunk: any) => chunk.result?.webResults)?.result
197 |       .webResults,
198 |     metadata: chunks[0],
199 |   };
200 | }
201 | 


--------------------------------------------------------------------------------
/src/messages.test.ts:
--------------------------------------------------------------------------------
  1 | import { getScraper } from './test-utils';
  2 | import { jest } from '@jest/globals';
  3 | 
  4 | let shouldSkipV2Tests = false;
  5 | let testUserId: string;
  6 | let testConversationId: string;
  7 | 
  8 | beforeAll(async () => {
  9 |   const {
 10 |     TWITTER_API_KEY,
 11 |     TWITTER_API_SECRET_KEY,
 12 |     TWITTER_ACCESS_TOKEN,
 13 |     TWITTER_ACCESS_TOKEN_SECRET,
 14 |     TWITTER_USERNAME,
 15 |   } = process.env;
 16 | 
 17 |   if (
 18 |     !TWITTER_API_KEY ||
 19 |     !TWITTER_API_SECRET_KEY ||
 20 |     !TWITTER_ACCESS_TOKEN ||
 21 |     !TWITTER_ACCESS_TOKEN_SECRET ||
 22 |     !TWITTER_USERNAME
 23 |   ) {
 24 |     console.warn(
 25 |       'Skipping tests: Twitter API v2 keys are not available in environment variables.',
 26 |     );
 27 |     shouldSkipV2Tests = true;
 28 |     return;
 29 |   }
 30 | 
 31 |   try {
 32 |     // Get the user ID from username
 33 |     const scraper = await getScraper();
 34 |     const profile = await scraper.getProfile(TWITTER_USERNAME);
 35 | 
 36 |     if (!profile.userId) {
 37 |       throw new Error('User ID not found');
 38 |     }
 39 | 
 40 |     testUserId = profile.userId;
 41 | 
 42 |     // Get first conversation ID for testing
 43 |     const conversations = await scraper.getDirectMessageConversations(
 44 |       testUserId,
 45 |     );
 46 | 
 47 |     if (
 48 |       !conversations.conversations.length &&
 49 |       !conversations.conversations[0].conversationId
 50 |     ) {
 51 |       throw new Error('No conversations found');
 52 |     }
 53 | 
 54 |     // testConversationId = conversations.conversations[0].conversationId;
 55 |     testConversationId = '1025530896651362304-1247854858931040258';
 56 |   } catch (error) {
 57 |     console.error('Failed to initialize test data:', error);
 58 |     shouldSkipV2Tests = true;
 59 |   }
 60 | });
 61 | 
 62 | describe('Direct Message Tests', () => {
 63 |   beforeEach(() => {
 64 |     if (shouldSkipV2Tests || !testUserId || !testConversationId) {
 65 |       console.warn('Skipping test: Required test data not available');
 66 |       return;
 67 |     }
 68 |   });
 69 | 
 70 |   test('should get DM conversations', async () => {
 71 |     if (shouldSkipV2Tests) return;
 72 | 
 73 |     const scraper = await getScraper();
 74 |     const conversations = await scraper.getDirectMessageConversations(
 75 |       testUserId,
 76 |     );
 77 | 
 78 |     expect(conversations).toBeDefined();
 79 |     expect(conversations.conversations).toBeInstanceOf(Array);
 80 |     expect(conversations.users).toBeInstanceOf(Array);
 81 |   }, 30000);
 82 | 
 83 |   test('should handle DM send failure gracefully', async () => {
 84 |     if (shouldSkipV2Tests) return;
 85 | 
 86 |     const scraper = await getScraper();
 87 |     const invalidConversationId = 'invalid-id';
 88 | 
 89 |     await expect(
 90 |       scraper.sendDirectMessage(invalidConversationId, 'test message'),
 91 |     ).rejects.toThrow();
 92 |   }, 30000);
 93 | 
 94 |   test('should verify DM conversation structure', async () => {
 95 |     if (shouldSkipV2Tests) return;
 96 | 
 97 |     const scraper = await getScraper();
 98 |     const conversations = await scraper.getDirectMessageConversations(
 99 |       testUserId,
100 |     );
101 | 
102 |     if (conversations.conversations.length > 0) {
103 |       const conversation = conversations.conversations[0];
104 | 
105 |       // Test conversation structure
106 |       expect(conversation).toHaveProperty('conversationId');
107 |       expect(conversation).toHaveProperty('messages');
108 |       expect(conversation).toHaveProperty('participants');
109 | 
110 |       // Test participants structure
111 |       expect(conversation.participants[0]).toHaveProperty('id');
112 |       expect(conversation.participants[0]).toHaveProperty('screenName');
113 | 
114 |       // Test message structure if messages exist
115 |       if (conversation.messages.length > 0) {
116 |         const message = conversation.messages[0];
117 |         expect(message).toHaveProperty('id');
118 |         expect(message).toHaveProperty('text');
119 |         expect(message).toHaveProperty('senderId');
120 |         expect(message).toHaveProperty('recipientId');
121 |         expect(message).toHaveProperty('createdAt');
122 |       }
123 |     }
124 |   }, 30000);
125 | });
126 | 


--------------------------------------------------------------------------------
/src/messages.ts:
--------------------------------------------------------------------------------
  1 | import { TwitterAuth } from './auth';
  2 | import { updateCookieJar } from './requests';
  3 | 
  4 | export interface DirectMessage {
  5 |   id: string;
  6 |   text: string;
  7 |   senderId: string;
  8 |   recipientId: string;
  9 |   createdAt: string;
 10 |   mediaUrls?: string[];
 11 |   senderScreenName?: string;
 12 |   recipientScreenName?: string;
 13 | }
 14 | 
 15 | export interface DirectMessageConversation {
 16 |   conversationId: string;
 17 |   messages: DirectMessage[];
 18 |   participants: {
 19 |     id: string;
 20 |     screenName: string;
 21 |   }[];
 22 | }
 23 | 
 24 | export interface DirectMessageEvent {
 25 |   id: string;
 26 |   type: string;
 27 |   message_create: {
 28 |     sender_id: string;
 29 |     target: {
 30 |       recipient_id: string;
 31 |     };
 32 |     message_data: {
 33 |       text: string;
 34 |       created_at: string;
 35 |       entities?: {
 36 |         urls?: Array<{
 37 |           url: string;
 38 |           expanded_url: string;
 39 |           display_url: string;
 40 |         }>;
 41 |         media?: Array<{
 42 |           url: string;
 43 |           type: string;
 44 |         }>;
 45 |       };
 46 |     };
 47 |   };
 48 | }
 49 | 
 50 | export interface DirectMessagesResponse {
 51 |   conversations: DirectMessageConversation[];
 52 |   users: TwitterUser[];
 53 |   cursor?: string;
 54 |   lastSeenEventId?: string;
 55 |   trustedLastSeenEventId?: string;
 56 |   untrustedLastSeenEventId?: string;
 57 |   inboxTimelines?: {
 58 |     trusted?: {
 59 |       status: string;
 60 |       minEntryId?: string;
 61 |     };
 62 |     untrusted?: {
 63 |       status: string;
 64 |       minEntryId?: string;
 65 |     };
 66 |   };
 67 |   userId: string;
 68 | }
 69 | 
 70 | export interface TwitterUser {
 71 |   id: string;
 72 |   screenName: string;
 73 |   name: string;
 74 |   profileImageUrl: string;
 75 |   description?: string;
 76 |   verified?: boolean;
 77 |   protected?: boolean;
 78 |   followersCount?: number;
 79 |   friendsCount?: number;
 80 | }
 81 | 
 82 | export interface SendDirectMessageResponse {
 83 |   entries: {
 84 |     message: {
 85 |       id: string;
 86 |       time: string;
 87 |       affects_sort: boolean;
 88 |       conversation_id: string;
 89 |       message_data: {
 90 |         id: string;
 91 |         time: string;
 92 |         recipient_id: string;
 93 |         sender_id: string;
 94 |         text: string;
 95 |       };
 96 |     };
 97 |   }[];
 98 |   users: Record<string, TwitterUser>;
 99 | }
100 | 
101 | function parseDirectMessageConversations(
102 |   data: any,
103 |   userId: string,
104 | ): DirectMessagesResponse {
105 |   try {
106 |     const inboxState = data?.inbox_initial_state;
107 |     const conversations = inboxState?.conversations || {};
108 |     const entries = inboxState?.entries || [];
109 |     const users = inboxState?.users || {};
110 | 
111 |     // Parse users first
112 |     const parsedUsers: TwitterUser[] = Object.values(users).map(
113 |       (user: any) => ({
114 |         id: user.id_str,
115 |         screenName: user.screen_name,
116 |         name: user.name,
117 |         profileImageUrl: user.profile_image_url_https,
118 |         description: user.description,
119 |         verified: user.verified,
120 |         protected: user.protected,
121 |         followersCount: user.followers_count,
122 |         friendsCount: user.friends_count,
123 |       }),
124 |     );
125 | 
126 |     // Group messages by conversation_id
127 |     const messagesByConversation: Record<string, any[]> = {};
128 |     entries.forEach((entry: any) => {
129 |       if (entry.message) {
130 |         const convId = entry.message.conversation_id;
131 |         if (!messagesByConversation[convId]) {
132 |           messagesByConversation[convId] = [];
133 |         }
134 |         messagesByConversation[convId].push(entry.message);
135 |       }
136 |     });
137 | 
138 |     // Convert to DirectMessageConversation array
139 |     const parsedConversations = Object.entries(conversations).map(
140 |       ([convId, conv]: [string, any]) => {
141 |         const messages = messagesByConversation[convId] || [];
142 | 
143 |         // Sort messages by time in ascending order
144 |         messages.sort((a, b) => Number(a.time) - Number(b.time));
145 | 
146 |         return {
147 |           conversationId: convId,
148 |           messages: parseDirectMessages(messages, users),
149 |           participants: conv.participants.map((p: any) => ({
150 |             id: p.user_id,
151 |             screenName: users[p.user_id]?.screen_name || p.user_id,
152 |           })),
153 |         };
154 |       },
155 |     );
156 | 
157 |     return {
158 |       conversations: parsedConversations,
159 |       users: parsedUsers,
160 |       cursor: inboxState?.cursor,
161 |       lastSeenEventId: inboxState?.last_seen_event_id,
162 |       trustedLastSeenEventId: inboxState?.trusted_last_seen_event_id,
163 |       untrustedLastSeenEventId: inboxState?.untrusted_last_seen_event_id,
164 |       inboxTimelines: {
165 |         trusted: inboxState?.inbox_timelines?.trusted && {
166 |           status: inboxState.inbox_timelines.trusted.status,
167 |           minEntryId: inboxState.inbox_timelines.trusted.min_entry_id,
168 |         },
169 |         untrusted: inboxState?.inbox_timelines?.untrusted && {
170 |           status: inboxState.inbox_timelines.untrusted.status,
171 |           minEntryId: inboxState.inbox_timelines.untrusted.min_entry_id,
172 |         },
173 |       },
174 |       userId,
175 |     };
176 |   } catch (error) {
177 |     console.error('Error parsing DM conversations:', error);
178 |     return {
179 |       conversations: [],
180 |       users: [],
181 |       userId,
182 |     };
183 |   }
184 | }
185 | 
186 | function parseDirectMessages(messages: any[], users: any): DirectMessage[] {
187 |   try {
188 |     return messages.map((msg: any) => ({
189 |       id: msg.message_data.id,
190 |       text: msg.message_data.text,
191 |       senderId: msg.message_data.sender_id,
192 |       recipientId: msg.message_data.recipient_id,
193 |       createdAt: msg.message_data.time,
194 |       mediaUrls: extractMediaUrls(msg.message_data),
195 |       senderScreenName: users[msg.message_data.sender_id]?.screen_name,
196 |       recipientScreenName: users[msg.message_data.recipient_id]?.screen_name,
197 |     }));
198 |   } catch (error) {
199 |     console.error('Error parsing DMs:', error);
200 |     return [];
201 |   }
202 | }
203 | 
204 | function extractMediaUrls(messageData: any): string[] | undefined {
205 |   const urls: string[] = [];
206 | 
207 |   // Extract URLs from entities if they exist
208 |   if (messageData.entities?.urls) {
209 |     messageData.entities.urls.forEach((url: any) => {
210 |       urls.push(url.expanded_url);
211 |     });
212 |   }
213 | 
214 |   // Extract media URLs if they exist
215 |   if (messageData.entities?.media) {
216 |     messageData.entities.media.forEach((media: any) => {
217 |       urls.push(media.media_url_https || media.media_url);
218 |     });
219 |   }
220 | 
221 |   return urls.length > 0 ? urls : undefined;
222 | }
223 | 
224 | export async function getDirectMessageConversations(
225 |   userId: string,
226 |   auth: TwitterAuth,
227 |   cursor?: string,
228 | ): Promise<DirectMessagesResponse> {
229 |   if (!auth.isLoggedIn()) {
230 |     throw new Error('Authentication required to fetch direct messages');
231 |   }
232 | 
233 |   const url =
234 |     'https://twitter.com/i/api/graphql/7s3kOODhC5vgXlO0OlqYdA/DMInboxTimeline';
235 |   const messageListUrl = 'https://x.com/i/api/1.1/dm/inbox_initial_state.json';
236 | 
237 |   const params = new URLSearchParams();
238 | 
239 |   if (cursor) {
240 |     params.append('cursor', cursor);
241 |   }
242 | 
243 |   const finalUrl = `${messageListUrl}${
244 |     params.toString() ? '?' + params.toString() : ''
245 |   }`;
246 |   const cookies = await auth.cookieJar().getCookies(url);
247 |   const xCsrfToken = cookies.find((cookie) => cookie.key === 'ct0');
248 | 
249 |   const headers = new Headers({
250 |     authorization: `Bearer ${(auth as any).bearerToken}`,
251 |     cookie: await auth.cookieJar().getCookieString(url),
252 |     'content-type': 'application/json',
253 |     'User-Agent':
254 |       'Mozilla/5.0 (Linux; Android 11; Nokia G20) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.88 Mobile Safari/537.36',
255 |     'x-guest-token': (auth as any).guestToken,
256 |     'x-twitter-auth-type': 'OAuth2Client',
257 |     'x-twitter-active-user': 'yes',
258 |     'x-csrf-token': xCsrfToken?.value as string,
259 |   });
260 | 
261 |   const response = await fetch(finalUrl, {
262 |     method: 'GET',
263 |     headers,
264 |   });
265 | 
266 |   await updateCookieJar(auth.cookieJar(), response.headers);
267 | 
268 |   if (!response.ok) {
269 |     throw new Error(await response.text());
270 |   }
271 | 
272 |   // parse the response
273 |   const data = await response.json();
274 |   return parseDirectMessageConversations(data, userId);
275 | }
276 | 
277 | export async function sendDirectMessage(
278 |   auth: TwitterAuth,
279 |   conversation_id: string,
280 |   text: string,
281 | ): Promise<SendDirectMessageResponse> {
282 |   if (!auth.isLoggedIn()) {
283 |     throw new Error('Authentication required to send direct messages');
284 |   }
285 | 
286 |   const url =
287 |     'https://twitter.com/i/api/graphql/7s3kOODhC5vgXlO0OlqYdA/DMInboxTimeline';
288 |   const messageDmUrl = 'https://x.com/i/api/1.1/dm/new2.json';
289 | 
290 |   const cookies = await auth.cookieJar().getCookies(url);
291 |   const xCsrfToken = cookies.find((cookie) => cookie.key === 'ct0');
292 | 
293 |   const headers = new Headers({
294 |     authorization: `Bearer ${(auth as any).bearerToken}`,
295 |     cookie: await auth.cookieJar().getCookieString(url),
296 |     'content-type': 'application/json',
297 |     'User-Agent':
298 |       'Mozilla/5.0 (Linux; Android 11; Nokia G20) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.88 Mobile Safari/537.36',
299 |     'x-guest-token': (auth as any).guestToken,
300 |     'x-twitter-auth-type': 'OAuth2Client',
301 |     'x-twitter-active-user': 'yes',
302 |     'x-csrf-token': xCsrfToken?.value as string,
303 |   });
304 | 
305 |   const payload = {
306 |     conversation_id: `${conversation_id}`,
307 |     recipient_ids: false,
308 |     text: text,
309 |     cards_platform: 'Web-12',
310 |     include_cards: 1,
311 |     include_quote_count: true,
312 |     dm_users: false,
313 |   };
314 | 
315 |   const response = await fetch(messageDmUrl, {
316 |     method: 'POST',
317 |     headers,
318 |     body: JSON.stringify(payload),
319 |   });
320 | 
321 |   await updateCookieJar(auth.cookieJar(), response.headers);
322 | 
323 |   if (!response.ok) {
324 |     throw new Error(await response.text());
325 |   }
326 | 
327 |   return await response.json();
328 | }
329 | 


--------------------------------------------------------------------------------
/src/platform/index.ts:
--------------------------------------------------------------------------------
 1 | import { PlatformExtensions, genericPlatform } from './platform-interface';
 2 | 
 3 | export * from './platform-interface';
 4 | 
 5 | declare const PLATFORM_NODE: boolean;
 6 | declare const PLATFORM_NODE_JEST: boolean;
 7 | 
 8 | export class Platform implements PlatformExtensions {
 9 |   async randomizeCiphers() {
10 |     const platform = await Platform.importPlatform();
11 |     await platform?.randomizeCiphers();
12 |   }
13 | 
14 |   private static async importPlatform(): Promise<null | PlatformExtensions> {
15 |     if (PLATFORM_NODE) {
16 |       const { platform } = await import('./node/index.js');
17 |       return platform as PlatformExtensions;
18 |     } else if (PLATFORM_NODE_JEST) {
19 |       // Jest gets unhappy when using an await import here, so we just use require instead.
20 |       // eslint-disable-next-line @typescript-eslint/no-var-requires
21 |       const { platform } = require('./node');
22 |       return platform as PlatformExtensions;
23 |     }
24 | 
25 |     return genericPlatform;
26 |   }
27 | }
28 | 


--------------------------------------------------------------------------------
/src/platform/node/index.ts:
--------------------------------------------------------------------------------
 1 | import { PlatformExtensions } from '../platform-interface';
 2 | import { randomizeCiphers } from './randomize-ciphers';
 3 | 
 4 | class NodePlatform implements PlatformExtensions {
 5 |   randomizeCiphers(): Promise<void> {
 6 |     randomizeCiphers();
 7 |     return Promise.resolve();
 8 |   }
 9 | }
10 | 
11 | export const platform = new NodePlatform();
12 | 


--------------------------------------------------------------------------------
/src/platform/node/randomize-ciphers.ts:
--------------------------------------------------------------------------------
 1 | import tls from 'node:tls';
 2 | import { randomBytes } from 'node:crypto';
 3 | 
 4 | const ORIGINAL_CIPHERS = tls.DEFAULT_CIPHERS;
 5 | 
 6 | // How many ciphers from the top of the list to shuffle.
 7 | // The remaining ciphers are left in the original order.
 8 | const TOP_N_SHUFFLE = 8;
 9 | 
10 | // Modified variation of https://stackoverflow.com/a/12646864
11 | const shuffleArray = (array: unknown[]) => {
12 |   for (let i = array.length - 1; i > 0; i--) {
13 |     const j = randomBytes(4).readUint32LE() % array.length;
14 |     [array[i], array[j]] = [array[j], array[i]];
15 |   }
16 | 
17 |   return array;
18 | };
19 | 
20 | // https://github.com/imputnet/cobalt/pull/574
21 | export const randomizeCiphers = () => {
22 |   do {
23 |     const cipherList = ORIGINAL_CIPHERS.split(':');
24 |     const shuffled = shuffleArray(cipherList.slice(0, TOP_N_SHUFFLE));
25 |     const retained = cipherList.slice(TOP_N_SHUFFLE);
26 | 
27 |     tls.DEFAULT_CIPHERS = [...shuffled, ...retained].join(':');
28 |   } while (tls.DEFAULT_CIPHERS === ORIGINAL_CIPHERS);
29 | };
30 | 


--------------------------------------------------------------------------------
/src/platform/platform-interface.ts:
--------------------------------------------------------------------------------
 1 | export interface PlatformExtensions {
 2 |   /**
 3 |    * Randomizes the runtime's TLS ciphers to bypass TLS client fingerprinting, which
 4 |    * hopefully avoids random 404s on some requests.
 5 |    *
 6 |    * **References:**
 7 |    * - https://github.com/imputnet/cobalt/pull/574
 8 |    */
 9 |   randomizeCiphers(): Promise<void>;
10 | }
11 | 
12 | export const genericPlatform = new (class implements PlatformExtensions {
13 |   randomizeCiphers(): Promise<void> {
14 |     return Promise.resolve();
15 |   }
16 | })();
17 | 


--------------------------------------------------------------------------------
/src/profile.test.ts:
--------------------------------------------------------------------------------
 1 | import { Profile } from './profile';
 2 | import { getScraper } from './test-utils';
 3 | 
 4 | test('scraper can get screen name by user id', async () => {
 5 |   const scraper = await getScraper();
 6 |   const screenName = await scraper.getScreenNameByUserId('1586562503865008129');
 7 |   expect(screenName).toEqual('ligma__sigma');
 8 | });
 9 | 
10 | test('scraper can get profile', async () => {
11 |   const expected: Profile = {
12 |     avatar:
13 |       'https://pbs.twimg.com/profile_images/436075027193004032/XlDa2oaz.jpeg',
14 |     banner: 'https://pbs.twimg.com/profile_banners/106037940/1541084318',
15 |     biography: 'nothing',
16 |     isPrivate: false,
17 |     isVerified: false,
18 |     joined: new Date(Date.UTC(2010, 0, 18, 8, 49, 30, 0)),
19 |     location: 'Ukraine',
20 |     name: 'Nomadic',
21 |     pinnedTweetIds: [],
22 |     url: 'https://twitter.com/nomadic_ua',
23 |     userId: '106037940',
24 |     username: 'nomadic_ua',
25 |     website: 'https://nomadic.name',
26 |   };
27 | 
28 |   const scraper = await getScraper();
29 | 
30 |   const actual = await scraper.getProfile('nomadic_ua');
31 |   expect(actual.avatar).toEqual(expected.avatar);
32 |   expect(actual.banner).toEqual(expected.banner);
33 |   expect(actual.biography).toEqual(expected.biography);
34 |   expect(actual.isPrivate).toEqual(expected.isPrivate);
35 |   expect(actual.isVerified).toEqual(expected.isVerified);
36 |   expect(actual.joined).toEqual(expected.joined);
37 |   expect(actual.location).toEqual(expected.location);
38 |   expect(actual.name).toEqual(expected.name);
39 |   expect(actual.pinnedTweetIds).toEqual(expected.pinnedTweetIds);
40 |   expect(actual.url).toEqual(expected.url);
41 |   expect(actual.userId).toEqual(expected.userId);
42 |   expect(actual.username).toEqual(expected.username);
43 |   expect(actual.website).toEqual(expected.website);
44 | });
45 | 
46 | test('scraper can get partial private profile', async () => {
47 |   const expected: Profile = {
48 |     avatar:
49 |       'https://pbs.twimg.com/profile_images/1612213936082030594/_HEsjv7Q.jpg',
50 |     banner:
51 |       'https://pbs.twimg.com/profile_banners/1221221876849995777/1673110776',
52 |     biography: `t h e h e r m i t`,
53 |     isPrivate: true,
54 |     isVerified: false,
55 |     joined: new Date(Date.UTC(2020, 0, 26, 0, 3, 5, 0)),
56 |     location: 'sometimes',
57 |     name: 'private account',
58 |     pinnedTweetIds: [],
59 |     url: 'https://twitter.com/tomdumont',
60 |     userId: '1221221876849995777',
61 |     username: 'tomdumont',
62 |     website: undefined,
63 |   };
64 | 
65 |   const scraper = await getScraper();
66 | 
67 |   const actual = await scraper.getProfile('tomdumont');
68 |   expect(actual.avatar).toEqual(expected.avatar);
69 |   expect(actual.banner).toEqual(expected.banner);
70 |   expect(actual.biography).toEqual(expected.biography);
71 |   expect(actual.isPrivate).toEqual(expected.isPrivate);
72 |   expect(actual.isVerified).toEqual(expected.isVerified);
73 |   expect(actual.joined).toEqual(expected.joined);
74 |   expect(actual.location).toEqual(expected.location);
75 |   expect(actual.name).toEqual(expected.name);
76 |   expect(actual.pinnedTweetIds).toEqual(expected.pinnedTweetIds);
77 |   expect(actual.url).toEqual(expected.url);
78 |   expect(actual.userId).toEqual(expected.userId);
79 |   expect(actual.username).toEqual(expected.username);
80 |   expect(actual.website).toEqual(expected.website);
81 | });
82 | 
83 | test('scraper cannot get suspended profile', async () => {
84 |   const scraper = await getScraper();
85 |   // taken from https://en.wikipedia.org/wiki/Twitter_suspensions#List_of_notable_suspensions
86 |   expect(scraper.getProfile('RobertC20041800')).rejects.toThrow();
87 | });
88 | 
89 | test('scraper cannot get not found profile', async () => {
90 |   const scraper = await getScraper();
91 |   expect(scraper.getProfile('sample3123131')).rejects.toThrow();
92 | });
93 | 
94 | test('scraper can get profile by screen name', async () => {
95 |   const scraper = await getScraper();
96 |   await scraper.getProfile('Twitter');
97 | });
98 | 


--------------------------------------------------------------------------------
/src/profile.ts:
--------------------------------------------------------------------------------
  1 | import stringify from 'json-stable-stringify';
  2 | import { requestApi, RequestApiResult } from './api';
  3 | import { TwitterAuth } from './auth';
  4 | import { TwitterApiErrorRaw } from './errors';
  5 | 
  6 | export interface LegacyUserRaw {
  7 |   created_at?: string;
  8 |   description?: string;
  9 |   entities?: {
 10 |     url?: {
 11 |       urls?: {
 12 |         expanded_url?: string;
 13 |       }[];
 14 |     };
 15 |   };
 16 |   favourites_count?: number;
 17 |   followers_count?: number;
 18 |   friends_count?: number;
 19 |   media_count?: number;
 20 |   statuses_count?: number;
 21 |   id_str?: string;
 22 |   listed_count?: number;
 23 |   name?: string;
 24 |   location: string;
 25 |   geo_enabled?: boolean;
 26 |   pinned_tweet_ids_str?: string[];
 27 |   profile_background_color?: string;
 28 |   profile_banner_url?: string;
 29 |   profile_image_url_https?: string;
 30 |   protected?: boolean;
 31 |   screen_name?: string;
 32 |   verified?: boolean;
 33 |   has_custom_timelines?: boolean;
 34 |   has_extended_profile?: boolean;
 35 |   url?: string;
 36 |   can_dm?: boolean;
 37 | }
 38 | 
 39 | /**
 40 |  * A parsed profile object.
 41 |  */
 42 | export interface Profile {
 43 |   avatar?: string;
 44 |   banner?: string;
 45 |   biography?: string;
 46 |   birthday?: string;
 47 |   followersCount?: number;
 48 |   followingCount?: number;
 49 |   friendsCount?: number;
 50 |   mediaCount?: number;
 51 |   statusesCount?: number;
 52 |   isPrivate?: boolean;
 53 |   isVerified?: boolean;
 54 |   isBlueVerified?: boolean;
 55 |   joined?: Date;
 56 |   likesCount?: number;
 57 |   listedCount?: number;
 58 |   location: string;
 59 |   name?: string;
 60 |   pinnedTweetIds?: string[];
 61 |   tweetsCount?: number;
 62 |   url?: string;
 63 |   userId?: string;
 64 |   username?: string;
 65 |   website?: string;
 66 |   canDm?: boolean;
 67 | }
 68 | 
 69 | export interface UserRaw {
 70 |   data: {
 71 |     user: {
 72 |       result: {
 73 |         rest_id?: string;
 74 |         is_blue_verified?: boolean;
 75 |         legacy: LegacyUserRaw;
 76 |       };
 77 |     };
 78 |   };
 79 |   errors?: TwitterApiErrorRaw[];
 80 | }
 81 | 
 82 | function getAvatarOriginalSizeUrl(avatarUrl: string | undefined) {
 83 |   return avatarUrl ? avatarUrl.replace('_normal', '') : undefined;
 84 | }
 85 | 
 86 | export function parseProfile(
 87 |   user: LegacyUserRaw,
 88 |   isBlueVerified?: boolean,
 89 | ): Profile {
 90 |   const profile: Profile = {
 91 |     avatar: getAvatarOriginalSizeUrl(user.profile_image_url_https),
 92 |     banner: user.profile_banner_url,
 93 |     biography: user.description,
 94 |     followersCount: user.followers_count,
 95 |     followingCount: user.friends_count,
 96 |     friendsCount: user.friends_count,
 97 |     mediaCount: user.media_count,
 98 |     isPrivate: user.protected ?? false,
 99 |     isVerified: user.verified,
100 |     likesCount: user.favourites_count,
101 |     listedCount: user.listed_count,
102 |     location: user.location,
103 |     name: user.name,
104 |     pinnedTweetIds: user.pinned_tweet_ids_str,
105 |     tweetsCount: user.statuses_count,
106 |     url: `https://twitter.com/${user.screen_name}`,
107 |     userId: user.id_str,
108 |     username: user.screen_name,
109 |     isBlueVerified: isBlueVerified ?? false,
110 |     canDm: user.can_dm,
111 |   };
112 | 
113 |   if (user.created_at != null) {
114 |     profile.joined = new Date(Date.parse(user.created_at));
115 |   }
116 | 
117 |   const urls = user.entities?.url?.urls;
118 |   if (urls?.length != null && urls?.length > 0) {
119 |     profile.website = urls[0].expanded_url;
120 |   }
121 | 
122 |   return profile;
123 | }
124 | 
125 | export async function getProfile(
126 |   username: string,
127 |   auth: TwitterAuth,
128 | ): Promise<RequestApiResult<Profile>> {
129 |   const params = new URLSearchParams();
130 |   params.set(
131 |     'variables',
132 |     stringify({
133 |       screen_name: username,
134 |       withSafetyModeUserFields: true,
135 |     }) ?? '',
136 |   );
137 | 
138 |   params.set(
139 |     'features',
140 |     stringify({
141 |       hidden_profile_likes_enabled: false,
142 |       hidden_profile_subscriptions_enabled: false, // Auth-restricted
143 |       responsive_web_graphql_exclude_directive_enabled: true,
144 |       verified_phone_label_enabled: false,
145 |       subscriptions_verification_info_is_identity_verified_enabled: false,
146 |       subscriptions_verification_info_verified_since_enabled: true,
147 |       highlights_tweets_tab_ui_enabled: true,
148 |       creator_subscriptions_tweet_preview_api_enabled: true,
149 |       responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
150 |       responsive_web_graphql_timeline_navigation_enabled: true,
151 |     }) ?? '',
152 |   );
153 | 
154 |   params.set('fieldToggles', stringify({ withAuxiliaryUserLabels: false }) ?? '');
155 | 
156 |   const res = await requestApi<UserRaw>(
157 |     `https://twitter.com/i/api/graphql/G3KGOASz96M-Qu0nwmGXNg/UserByScreenName?${params.toString()}`,
158 |     auth,
159 |   );
160 |   if (!res.success) {
161 |     return res;
162 |   }
163 | 
164 |   const { value } = res;
165 |   const { errors } = value;
166 |   if (errors != null && errors.length > 0) {
167 |     return {
168 |       success: false,
169 |       err: new Error(errors[0].message),
170 |     };
171 |   }
172 | 
173 |   if (!value.data || !value.data.user || !value.data.user.result) {
174 |     return {
175 |       success: false,
176 |       err: new Error('User not found.'),
177 |     };
178 |   }
179 |   const { result: user } = value.data.user;
180 |   const { legacy } = user;
181 | 
182 |   if (user.rest_id == null || user.rest_id.length === 0) {
183 |     return {
184 |       success: false,
185 |       err: new Error('rest_id not found.'),
186 |     };
187 |   }
188 | 
189 |   legacy.id_str = user.rest_id;
190 | 
191 |   if (legacy.screen_name == null || legacy.screen_name.length === 0) {
192 |     return {
193 |       success: false,
194 |       err: new Error(`Either ${username} does not exist or is private.`),
195 |     };
196 |   }
197 | 
198 |   return {
199 |     success: true,
200 |     value: parseProfile(user.legacy, user.is_blue_verified),
201 |   };
202 | }
203 | 
204 | const idCache = new Map<string, string>();
205 | 
206 | export async function getScreenNameByUserId(
207 |   userId: string,
208 |   auth: TwitterAuth,
209 | ): Promise<RequestApiResult<string>> {
210 |   const params = new URLSearchParams();
211 |   params.set(
212 |     'variables',
213 |     stringify({
214 |       userId: userId,
215 |       withSafetyModeUserFields: true,
216 |     }) ?? '',
217 |   );
218 | 
219 |   params.set(
220 |     'features',
221 |     stringify({
222 |       hidden_profile_subscriptions_enabled: true,
223 |       rweb_tipjar_consumption_enabled: true,
224 |       responsive_web_graphql_exclude_directive_enabled: true,
225 |       verified_phone_label_enabled: false,
226 |       highlights_tweets_tab_ui_enabled: true,
227 |       responsive_web_twitter_article_notes_tab_enabled: true,
228 |       subscriptions_feature_can_gift_premium: false,
229 |       creator_subscriptions_tweet_preview_api_enabled: true,
230 |       responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
231 |       responsive_web_graphql_timeline_navigation_enabled: true,
232 |     }) ?? '',
233 |   );
234 | 
235 |   const res = await requestApi<UserRaw>(
236 |     `https://twitter.com/i/api/graphql/xf3jd90KKBCUxdlI_tNHZw/UserByRestId?${params.toString()}`,
237 |     auth,
238 |   );
239 | 
240 |   if (!res.success) {
241 |     return res;
242 |   }
243 | 
244 |   const { value } = res;
245 |   const { errors } = value;
246 |   if (errors != null && errors.length > 0) {
247 |     return {
248 |       success: false,
249 |       err: new Error(errors[0].message),
250 |     };
251 |   }
252 | 
253 |   if (!value.data || !value.data.user || !value.data.user.result) {
254 |     return {
255 |       success: false,
256 |       err: new Error('User not found.'),
257 |     };
258 |   }
259 | 
260 |   const { result: user } = value.data.user;
261 |   const { legacy } = user;
262 | 
263 |   if (legacy.screen_name == null || legacy.screen_name.length === 0) {
264 |     return {
265 |       success: false,
266 |       err: new Error(
267 |         `Either user with ID ${userId} does not exist or is private.`,
268 |       ),
269 |     };
270 |   }
271 | 
272 |   return {
273 |     success: true,
274 |     value: legacy.screen_name,
275 |   };
276 | }
277 | 
278 | export async function getUserIdByScreenName(
279 |   screenName: string,
280 |   auth: TwitterAuth,
281 | ): Promise<RequestApiResult<string>> {
282 |   const cached = idCache.get(screenName);
283 |   if (cached != null) {
284 |     return { success: true, value: cached };
285 |   }
286 | 
287 |   const profileRes = await getProfile(screenName, auth);
288 |   if (!profileRes.success) {
289 |     return profileRes;
290 |   }
291 | 
292 |   const profile = profileRes.value;
293 |   if (profile.userId != null) {
294 |     idCache.set(screenName, profile.userId);
295 | 
296 |     return {
297 |       success: true,
298 |       value: profile.userId,
299 |     };
300 |   }
301 | 
302 |   return {
303 |     success: false,
304 |     err: new Error('User ID is undefined.'),
305 |   };
306 | }
307 | 


--------------------------------------------------------------------------------
/src/relationships.test.ts:
--------------------------------------------------------------------------------
 1 | import { getScraper } from './test-utils';
 2 | 
 3 | test('scraper can get profile followers', async () => {
 4 |   const scraper = await getScraper();
 5 | 
 6 |   const seenProfiles = new Map<string, boolean>();
 7 |   const maxProfiles = 50;
 8 |   let nProfiles = 0;
 9 | 
10 |   const profiles = await scraper.getFollowers(
11 |     '1425600122885394432',
12 |     maxProfiles,
13 |   );
14 | 
15 |   for await (const profile of profiles) {
16 |     nProfiles++;
17 | 
18 |     const id = profile.userId;
19 |     expect(id).toBeTruthy();
20 | 
21 |     if (id != null) {
22 |       expect(seenProfiles.has(id)).toBeFalsy();
23 |       seenProfiles.set(id, true);
24 |     }
25 | 
26 |     expect(profile.username).toBeTruthy();
27 |   }
28 | 
29 |   expect(nProfiles).toEqual(maxProfiles);
30 | });
31 | 
32 | test('scraper can get profile following', async () => {
33 |   const scraper = await getScraper();
34 | 
35 |   const seenProfiles = new Map<string, boolean>();
36 |   const maxProfiles = 50;
37 |   let nProfiles = 0;
38 | 
39 |   const profiles = await scraper.getFollowing(
40 |     '1425600122885394432',
41 |     maxProfiles,
42 |   );
43 | 
44 |   for await (const profile of profiles) {
45 |     nProfiles++;
46 | 
47 |     const id = profile.userId;
48 |     expect(id).toBeTruthy();
49 | 
50 |     if (id != null) {
51 |       expect(seenProfiles.has(id)).toBeFalsy();
52 |       seenProfiles.set(id, true);
53 |     }
54 | 
55 |     expect(profile.username).toBeTruthy();
56 |   }
57 | 
58 |   expect(nProfiles).toEqual(maxProfiles);
59 | });
60 | 


--------------------------------------------------------------------------------
/src/relationships.ts:
--------------------------------------------------------------------------------
  1 | import { addApiFeatures, requestApi, bearerToken } from './api';
  2 | import { Headers } from 'headers-polyfill';
  3 | import { TwitterAuth } from './auth';
  4 | import { Profile, getUserIdByScreenName } from './profile';
  5 | import { QueryProfilesResponse } from './timeline-v1';
  6 | import { getUserTimeline } from './timeline-async';
  7 | import {
  8 |   RelationshipTimeline,
  9 |   parseRelationshipTimeline,
 10 | } from './timeline-relationship';
 11 | import stringify from 'json-stable-stringify';
 12 | 
 13 | export function getFollowing(
 14 |   userId: string,
 15 |   maxProfiles: number,
 16 |   auth: TwitterAuth,
 17 | ): AsyncGenerator<Profile, void> {
 18 |   return getUserTimeline(userId, maxProfiles, (q, mt, c) => {
 19 |     return fetchProfileFollowing(q, mt, auth, c);
 20 |   });
 21 | }
 22 | 
 23 | export function getFollowers(
 24 |   userId: string,
 25 |   maxProfiles: number,
 26 |   auth: TwitterAuth,
 27 | ): AsyncGenerator<Profile, void> {
 28 |   return getUserTimeline(userId, maxProfiles, (q, mt, c) => {
 29 |     return fetchProfileFollowers(q, mt, auth, c);
 30 |   });
 31 | }
 32 | 
 33 | export async function fetchProfileFollowing(
 34 |   userId: string,
 35 |   maxProfiles: number,
 36 |   auth: TwitterAuth,
 37 |   cursor?: string,
 38 | ): Promise<QueryProfilesResponse> {
 39 |   const timeline = await getFollowingTimeline(
 40 |     userId,
 41 |     maxProfiles,
 42 |     auth,
 43 |     cursor,
 44 |   );
 45 | 
 46 |   return parseRelationshipTimeline(timeline);
 47 | }
 48 | 
 49 | export async function fetchProfileFollowers(
 50 |   userId: string,
 51 |   maxProfiles: number,
 52 |   auth: TwitterAuth,
 53 |   cursor?: string,
 54 | ): Promise<QueryProfilesResponse> {
 55 |   const timeline = await getFollowersTimeline(
 56 |     userId,
 57 |     maxProfiles,
 58 |     auth,
 59 |     cursor,
 60 |   );
 61 | 
 62 |   return parseRelationshipTimeline(timeline);
 63 | }
 64 | 
 65 | async function getFollowingTimeline(
 66 |   userId: string,
 67 |   maxItems: number,
 68 |   auth: TwitterAuth,
 69 |   cursor?: string,
 70 | ): Promise<RelationshipTimeline> {
 71 |   if (!auth.isLoggedIn()) {
 72 |     throw new Error('Scraper is not logged-in for profile following.');
 73 |   }
 74 | 
 75 |   if (maxItems > 50) {
 76 |     maxItems = 50;
 77 |   }
 78 | 
 79 |   const variables: Record<string, any> = {
 80 |     userId,
 81 |     count: maxItems,
 82 |     includePromotedContent: false,
 83 |   };
 84 | 
 85 |   const features = addApiFeatures({
 86 |     responsive_web_twitter_article_tweet_consumption_enabled: false,
 87 |     tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled:
 88 |       true,
 89 |     longform_notetweets_inline_media_enabled: true,
 90 |     responsive_web_media_download_video_enabled: false,
 91 |   });
 92 | 
 93 |   if (cursor != null && cursor != '') {
 94 |     variables['cursor'] = cursor;
 95 |   }
 96 | 
 97 |   const params = new URLSearchParams();
 98 |   params.set('features', stringify(features) ?? '');
 99 |   params.set('variables', stringify(variables) ?? '');
100 | 
101 |   const res = await requestApi<RelationshipTimeline>(
102 |     `https://twitter.com/i/api/graphql/iSicc7LrzWGBgDPL0tM_TQ/Following?${params.toString()}`,
103 |     auth,
104 |   );
105 | 
106 |   if (!res.success) {
107 |     throw res.err;
108 |   }
109 | 
110 |   return res.value;
111 | }
112 | 
113 | async function getFollowersTimeline(
114 |   userId: string,
115 |   maxItems: number,
116 |   auth: TwitterAuth,
117 |   cursor?: string,
118 | ): Promise<RelationshipTimeline> {
119 |   if (!auth.isLoggedIn()) {
120 |     throw new Error('Scraper is not logged-in for profile followers.');
121 |   }
122 | 
123 |   if (maxItems > 50) {
124 |     maxItems = 50;
125 |   }
126 | 
127 |   const variables: Record<string, any> = {
128 |     userId,
129 |     count: maxItems,
130 |     includePromotedContent: false,
131 |   };
132 | 
133 |   const features = addApiFeatures({
134 |     responsive_web_twitter_article_tweet_consumption_enabled: false,
135 |     tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled:
136 |       true,
137 |     longform_notetweets_inline_media_enabled: true,
138 |     responsive_web_media_download_video_enabled: false,
139 |   });
140 | 
141 |   if (cursor != null && cursor != '') {
142 |     variables['cursor'] = cursor;
143 |   }
144 | 
145 |   const params = new URLSearchParams();
146 |   params.set('features', stringify(features) ?? '');
147 |   params.set('variables', stringify(variables) ?? '');
148 | 
149 |   const res = await requestApi<RelationshipTimeline>(
150 |     `https://twitter.com/i/api/graphql/rRXFSG5vR6drKr5M37YOTw/Followers?${params.toString()}`,
151 |     auth,
152 |   );
153 | 
154 |   if (!res.success) {
155 |     throw res.err;
156 |   }
157 | 
158 |   return res.value;
159 | }
160 | 
161 | export async function followUser(
162 |   username: string,
163 |   auth: TwitterAuth,
164 | ): Promise<Response> {
165 | 
166 |   // Check if the user is logged in
167 |   if (!(await auth.isLoggedIn())) {
168 |     throw new Error('Must be logged in to follow users');
169 |   }
170 |   // Get user ID from username
171 |   const userIdResult = await getUserIdByScreenName(username, auth);
172 | 
173 |   if (!userIdResult.success) {
174 |     throw new Error(`Failed to get user ID: ${userIdResult.err.message}`);
175 |   }
176 | 
177 |   const userId = userIdResult.value;
178 | 
179 |   // Prepare the request body
180 |   const requestBody = {
181 |     include_profile_interstitial_type: '1',
182 |     skip_status: 'true',
183 |     user_id: userId,
184 |   };
185 | 
186 |   // Prepare the headers
187 |   const headers = new Headers({
188 |     'Content-Type': 'application/x-www-form-urlencoded',
189 |     Referer: `https://twitter.com/${username}`,
190 |     'X-Twitter-Active-User': 'yes',
191 |     'X-Twitter-Auth-Type': 'OAuth2Session',
192 |     'X-Twitter-Client-Language': 'en',
193 |     Authorization: `Bearer ${bearerToken}`,
194 |   });
195 | 
196 |   // Install auth headers
197 |   await auth.installTo(headers, 'https://api.twitter.com/1.1/friendships/create.json');
198 |   
199 |   // Make the follow request using auth.fetch
200 |   const res = await auth.fetch(
201 |     'https://api.twitter.com/1.1/friendships/create.json',
202 |     {
203 |       method: 'POST',
204 |       headers,
205 |       body: new URLSearchParams(requestBody).toString(),
206 |       credentials: 'include',
207 |     },
208 |   );
209 | 
210 |   if (!res.ok) {
211 |     throw new Error(`Failed to follow user: ${res.statusText}`);
212 |   }
213 | 
214 |   const data = await res.json();
215 | 
216 |   return new Response(JSON.stringify(data), {
217 |     status: 200,
218 |     headers: {
219 |       'Content-Type': 'application/json',
220 |     },
221 |   });
222 | }


--------------------------------------------------------------------------------
/src/requests.ts:
--------------------------------------------------------------------------------
 1 | import { Cookie, CookieJar } from 'tough-cookie';
 2 | import setCookie from 'set-cookie-parser';
 3 | import type { Headers as HeadersPolyfill } from 'headers-polyfill';
 4 | 
 5 | /**
 6 |  * Updates a cookie jar with the Set-Cookie headers from the provided Headers instance.
 7 |  * @param cookieJar The cookie jar to update.
 8 |  * @param headers The response headers to populate the cookie jar with.
 9 |  */
10 | export async function updateCookieJar(
11 |   cookieJar: CookieJar,
12 |   headers: Headers | HeadersPolyfill,
13 | ) {
14 |   const setCookieHeader = headers.get('set-cookie');
15 |   if (setCookieHeader) {
16 |     const cookies = setCookie.splitCookiesString(setCookieHeader);
17 |     for (const cookie of cookies.map((c) => Cookie.parse(c))) {
18 |       if (!cookie) continue;
19 |       await cookieJar.setCookie(
20 |         cookie,
21 |         `${cookie.secure ? 'https' : 'http'}://${cookie.domain}${cookie.path}`,
22 |       );
23 |     }
24 |   } else if (typeof document !== 'undefined') {
25 |     for (const cookie of document.cookie.split(';')) {
26 |       const hardCookie = Cookie.parse(cookie);
27 |       if (hardCookie) {
28 |         await cookieJar.setCookie(hardCookie, document.location.toString());
29 |       }
30 |     }
31 |   }
32 | }
33 | 


--------------------------------------------------------------------------------
/src/scraper.test.ts:
--------------------------------------------------------------------------------
 1 | import { Scraper } from './scraper';
 2 | import { getScraper } from './test-utils';
 3 | 
 4 | test('scraper can fetch home timeline', async () => {
 5 |   const scraper = await getScraper();
 6 | 
 7 |   const count = 20;
 8 |   const seenTweetIds: string[] = [];
 9 | 
10 |   const homeTimeline = await scraper.fetchHomeTimeline(count, seenTweetIds);
11 |   console.log(homeTimeline);
12 |   expect(homeTimeline).toBeDefined();
13 |   expect(homeTimeline?.length).toBeGreaterThan(0);
14 |   expect(homeTimeline[0]?.rest_id).toBeDefined();
15 | }, 30000);
16 | 
17 | test('scraper can fetch following timeline', async () => {
18 |   const scraper = await getScraper();
19 | 
20 |   const count = 20;
21 |   const seenTweetIds: string[] = [];
22 | 
23 |   const homeTimeline = await scraper.fetchFollowingTimeline(count, seenTweetIds);
24 |   console.log(homeTimeline);
25 |   expect(homeTimeline).toBeDefined();
26 |   expect(homeTimeline?.length).toBeGreaterThan(0);
27 |   expect(homeTimeline[0]?.rest_id).toBeDefined();
28 | }, 30000);
29 | 
30 | test('scraper uses response transform when provided', async () => {
31 |   const scraper = new Scraper({
32 |     transform: {
33 |       response: (response) =>
34 |         new Proxy(response, {
35 |           get(target, p, receiver) {
36 |             if (p === 'status') {
37 |               return 400;
38 |             }
39 | 
40 |             if (p === 'ok') {
41 |               return false;
42 |             }
43 | 
44 |             return Reflect.get(target, p, receiver);
45 |           },
46 |         }),
47 |     },
48 |   });
49 | 
50 |   await expect(scraper.getLatestTweet('twitter')).rejects.toThrow();
51 | });
52 | 


--------------------------------------------------------------------------------
/src/search.test.ts:
--------------------------------------------------------------------------------
 1 | import { getScraper } from './test-utils';
 2 | import { SearchMode } from './search';
 3 | import { QueryTweetsResponse } from './timeline-v1';
 4 | 
 5 | test('scraper can process search cursor', async () => {
 6 |   const scraper = await getScraper();
 7 | 
 8 |   let cursor: string | undefined = undefined;
 9 |   const maxTweets = 30;
10 |   let nTweets = 0;
11 |   while (nTweets < maxTweets) {
12 |     const res: QueryTweetsResponse = await scraper.fetchSearchTweets(
13 |       'twitter',
14 |       maxTweets,
15 |       SearchMode.Top,
16 |       cursor,
17 |     );
18 | 
19 |     expect(res.next).toBeTruthy();
20 | 
21 |     nTweets += res.tweets.length;
22 |     cursor = res.next;
23 |   }
24 | }, 30000);
25 | 
26 | test('scraper can search profiles', async () => {
27 |   const scraper = await getScraper();
28 | 
29 |   const seenProfiles = new Map<string, boolean>();
30 |   const maxProfiles = 150;
31 |   let nProfiles = 0;
32 | 
33 |   const profiles = scraper.searchProfiles('Twitter', maxProfiles);
34 |   for await (const profile of profiles) {
35 |     nProfiles++;
36 | 
37 |     const profileId = profile.userId;
38 |     expect(profileId).toBeTruthy();
39 | 
40 |     if (profileId != null) {
41 |       expect(seenProfiles.has(profileId)).toBeFalsy();
42 |       seenProfiles.set(profileId, true);
43 |     }
44 |   }
45 | 
46 |   expect(nProfiles).toEqual(maxProfiles);
47 | }, 30000);
48 | 
49 | test('scraper can search tweets', async () => {
50 |   const scraper = await getScraper();
51 | 
52 |   const seenTweets = new Map<string, boolean>();
53 |   const maxTweets = 150;
54 |   let nTweets = 0;
55 | 
56 |   const profiles = scraper.searchTweets(
57 |     'twitter',
58 |     maxTweets,
59 |     SearchMode.Latest,
60 |   );
61 | 
62 |   for await (const tweet of profiles) {
63 |     nTweets++;
64 | 
65 |     const id = tweet.id;
66 |     expect(id).toBeTruthy();
67 | 
68 |     if (id != null) {
69 |       expect(seenTweets.has(id)).toBeFalsy();
70 |       seenTweets.set(id, true);
71 |     }
72 | 
73 |     expect(tweet.permanentUrl).toBeTruthy();
74 |     expect(tweet.isRetweet).toBeFalsy();
75 |     expect(tweet.text).toBeTruthy();
76 |   }
77 | 
78 |   expect(nTweets).toEqual(maxTweets);
79 | }, 30000);
80 | 


--------------------------------------------------------------------------------
/src/search.ts:
--------------------------------------------------------------------------------
  1 | import { addApiFeatures, requestApi } from './api';
  2 | import { TwitterAuth } from './auth';
  3 | import { Profile } from './profile';
  4 | import { QueryProfilesResponse, QueryTweetsResponse } from './timeline-v1';
  5 | import { getTweetTimeline, getUserTimeline } from './timeline-async';
  6 | import { Tweet } from './tweets';
  7 | import {
  8 |   SearchTimeline,
  9 |   parseSearchTimelineTweets,
 10 |   parseSearchTimelineUsers,
 11 | } from './timeline-search';
 12 | import stringify from 'json-stable-stringify';
 13 | 
 14 | /**
 15 |  * The categories that can be used in Twitter searches.
 16 |  */
 17 | export enum SearchMode {
 18 |   Top,
 19 |   Latest,
 20 |   Photos,
 21 |   Videos,
 22 |   Users,
 23 | }
 24 | 
 25 | export function searchTweets(
 26 |   query: string,
 27 |   maxTweets: number,
 28 |   searchMode: SearchMode,
 29 |   auth: TwitterAuth,
 30 | ): AsyncGenerator<Tweet, void> {
 31 |   return getTweetTimeline(query, maxTweets, (q, mt, c) => {
 32 |     return fetchSearchTweets(q, mt, searchMode, auth, c);
 33 |   });
 34 | }
 35 | 
 36 | export function searchProfiles(
 37 |   query: string,
 38 |   maxProfiles: number,
 39 |   auth: TwitterAuth,
 40 | ): AsyncGenerator<Profile, void> {
 41 |   return getUserTimeline(query, maxProfiles, (q, mt, c) => {
 42 |     return fetchSearchProfiles(q, mt, auth, c);
 43 |   });
 44 | }
 45 | 
 46 | export async function fetchSearchTweets(
 47 |   query: string,
 48 |   maxTweets: number,
 49 |   searchMode: SearchMode,
 50 |   auth: TwitterAuth,
 51 |   cursor?: string,
 52 | ): Promise<QueryTweetsResponse> {
 53 |   const timeline = await getSearchTimeline(
 54 |     query,
 55 |     maxTweets,
 56 |     searchMode,
 57 |     auth,
 58 |     cursor,
 59 |   );
 60 | 
 61 |   return parseSearchTimelineTweets(timeline);
 62 | }
 63 | 
 64 | export async function fetchSearchProfiles(
 65 |   query: string,
 66 |   maxProfiles: number,
 67 |   auth: TwitterAuth,
 68 |   cursor?: string,
 69 | ): Promise<QueryProfilesResponse> {
 70 |   const timeline = await getSearchTimeline(
 71 |     query,
 72 |     maxProfiles,
 73 |     SearchMode.Users,
 74 |     auth,
 75 |     cursor,
 76 |   );
 77 | 
 78 |   return parseSearchTimelineUsers(timeline);
 79 | }
 80 | 
 81 | async function getSearchTimeline(
 82 |   query: string,
 83 |   maxItems: number,
 84 |   searchMode: SearchMode,
 85 |   auth: TwitterAuth,
 86 |   cursor?: string,
 87 | ): Promise<SearchTimeline> {
 88 |   if (!auth.isLoggedIn()) {
 89 |     throw new Error('Scraper is not logged-in for search.');
 90 |   }
 91 | 
 92 |   if (maxItems > 50) {
 93 |     maxItems = 50;
 94 |   }
 95 | 
 96 |   const variables: Record<string, any> = {
 97 |     rawQuery: query,
 98 |     count: maxItems,
 99 |     querySource: 'typed_query',
100 |     product: 'Top',
101 |   };
102 | 
103 |   const features = addApiFeatures({
104 |     longform_notetweets_inline_media_enabled: true,
105 |     responsive_web_enhance_cards_enabled: false,
106 |     responsive_web_media_download_video_enabled: false,
107 |     responsive_web_twitter_article_tweet_consumption_enabled: false,
108 |     tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled:
109 |       true,
110 |     interactive_text_enabled: false,
111 |     responsive_web_text_conversations_enabled: false,
112 |     vibe_api_enabled: false,
113 |   });
114 | 
115 |   const fieldToggles: Record<string, any> = {
116 |     withArticleRichContentState: false,
117 |   };
118 | 
119 |   if (cursor != null && cursor != '') {
120 |     variables['cursor'] = cursor;
121 |   }
122 | 
123 |   switch (searchMode) {
124 |     case SearchMode.Latest:
125 |       variables.product = 'Latest';
126 |       break;
127 |     case SearchMode.Photos:
128 |       variables.product = 'Photos';
129 |       break;
130 |     case SearchMode.Videos:
131 |       variables.product = 'Videos';
132 |       break;
133 |     case SearchMode.Users:
134 |       variables.product = 'People';
135 |       break;
136 |     default:
137 |       break;
138 |   }
139 | 
140 |   const params = new URLSearchParams();
141 |   params.set('features', stringify(features) ?? '');
142 |   params.set('fieldToggles', stringify(fieldToggles) ?? '');
143 |   params.set('variables', stringify(variables) ?? '');
144 | 
145 |   const res = await requestApi<SearchTimeline>(
146 |     `https://api.twitter.com/graphql/gkjsKepM6gl_HmFWoWKfgg/SearchTimeline?${params.toString()}`,
147 |     auth,
148 |   );
149 | 
150 |   if (!res.success) {
151 |     throw res.err;
152 |   }
153 | 
154 |   return res.value;
155 | }
156 | 
157 | /**
158 |  * Fetches one page of tweets that quote a given tweet ID.
159 |  * This function does not handle pagination.
160 |  * All comments must remain in English.
161 |  *
162 |  * @param quotedTweetId The tweet ID you want quotes of.
163 |  * @param maxTweets Maximum number of tweets to return in one page.
164 |  * @param auth The TwitterAuth object.
165 |  * @param cursor Optional pagination cursor for fetching further pages.
166 |  * @returns A promise that resolves to a QueryTweetsResponse containing tweets and the next cursor.
167 |  */
168 | export async function fetchQuotedTweetsPage(
169 |   quotedTweetId: string,
170 |   maxTweets: number,
171 |   auth: TwitterAuth,
172 |   cursor?: string,
173 | ): Promise<QueryTweetsResponse> {
174 |   if (maxTweets > 50) {
175 |     maxTweets = 50;
176 |   }
177 | 
178 |   // Build the rawQuery and variables
179 |   const variables: Record<string, any> = {
180 |     rawQuery: `quoted_tweet_id:${quotedTweetId}`,
181 |     count: maxTweets,
182 |     querySource: 'tdqt',
183 |     product: 'Top',
184 |   };
185 | 
186 |   if (cursor && cursor !== '') {
187 |     variables.cursor = cursor;
188 |   }
189 | 
190 |   const features = addApiFeatures({
191 |     profile_label_improvements_pcf_label_in_post_enabled: true,
192 |     rweb_tipjar_consumption_enabled: true,
193 |     responsive_web_graphql_exclude_directive_enabled: true,
194 |     verified_phone_label_enabled: false,
195 |     creator_subscriptions_tweet_preview_api_enabled: true,
196 |     responsive_web_graphql_timeline_navigation_enabled: true,
197 |     responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
198 |     premium_content_api_read_enabled: false,
199 |     communities_web_enable_tweet_community_results_fetch: true,
200 |     c9s_tweet_anatomy_moderator_badge_enabled: true,
201 |     responsive_web_grok_analyze_button_fetch_trends_enabled: false,
202 |     responsive_web_grok_analyze_post_followups_enabled: true,
203 |     responsive_web_jetfuel_frame: false,
204 |     responsive_web_grok_share_attachment_enabled: true,
205 |     articles_preview_enabled: true,
206 |     responsive_web_edit_tweet_api_enabled: true,
207 |     graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
208 |     view_counts_everywhere_api_enabled: true,
209 |     longform_notetweets_consumption_enabled: true,
210 |     responsive_web_twitter_article_tweet_consumption_enabled: true,
211 |     tweet_awards_web_tipping_enabled: false,
212 |     creator_subscriptions_quote_tweet_preview_enabled: false,
213 |     freedom_of_speech_not_reach_fetch_enabled: true,
214 |     standardized_nudges_misinfo: true,
215 |     tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled:
216 |       true,
217 |     rweb_video_timestamps_enabled: true,
218 |     longform_notetweets_rich_text_read_enabled: true,
219 |     longform_notetweets_inline_media_enabled: true,
220 |     responsive_web_grok_image_annotation_enabled: false,
221 |     responsive_web_enhance_cards_enabled: false,
222 |   });
223 | 
224 |   const fieldToggles: Record<string, any> = {
225 |     withArticleRichContentState: false,
226 |   };
227 | 
228 |   const params = new URLSearchParams();
229 |   params.set('features', stringify(features) ?? '');
230 |   params.set('fieldToggles', stringify(fieldToggles) ?? '');
231 |   params.set('variables', stringify(variables) ?? '');
232 | 
233 |   const url = `https://x.com/i/api/graphql/1BP5aKg8NvTNvRCyyCyq8g/SearchTimeline?${params.toString()}`;
234 | 
235 |   // Perform the request
236 |   const res = await requestApi(url, auth);
237 |   if (!res.success) {
238 |     throw res.err;
239 |   }
240 | 
241 |   // Force cast for TypeScript
242 |   const timeline = res.value as any;
243 |   // Use parseSearchTimelineTweets to convert timeline data
244 |   return parseSearchTimelineTweets(timeline);
245 | }
246 | 
247 | /**
248 |  * Creates an async generator, yielding pages of quotes for a given tweet ID.
249 |  * It prevents infinite loop by checking if the next cursor hasn't changed.
250 |  */
251 | export async function* searchQuotedTweets(
252 |   quotedTweetId: string,
253 |   maxTweets: number,
254 |   auth: TwitterAuth,
255 | ): AsyncGenerator<QueryTweetsResponse> {
256 |   let cursor: string | undefined;
257 | 
258 |   while (true) {
259 |     const response = await fetchQuotedTweetsPage(
260 |       quotedTweetId,
261 |       maxTweets,
262 |       auth,
263 |       cursor,
264 |     );
265 |     yield response;
266 | 
267 |     // Prevent infinite loop if the API keeps returning the same cursor
268 |     if (!response.next || response.next === cursor) {
269 |       break;
270 |     }
271 | 
272 |     // Update cursor for the next iteration
273 |     cursor = response.next;
274 |   }
275 | }
276 | 


--------------------------------------------------------------------------------
/src/spaces/core/ChatClient.ts:
--------------------------------------------------------------------------------
  1 | // src/core/ChatClient.ts
  2 | 
  3 | import WebSocket from 'ws';
  4 | import { EventEmitter } from 'events';
  5 | import type { SpeakerRequest, OccupancyUpdate } from '../types';
  6 | import { Logger } from '../logger';
  7 | 
  8 | /**
  9 |  * Configuration object for ChatClient.
 10 |  */
 11 | interface ChatClientConfig {
 12 |   /**
 13 |    * The space ID (e.g., "1vOGwAbcdE...") for this audio space.
 14 |    */
 15 |   spaceId: string;
 16 | 
 17 |   /**
 18 |    * The access token obtained from accessChat or the live_video_stream/status.
 19 |    */
 20 |   accessToken: string;
 21 | 
 22 |   /**
 23 |    * The endpoint host for the chat server (e.g., "https://prod-chatman-ancillary-eu-central-1.pscp.tv").
 24 |    */
 25 |   endpoint: string;
 26 | 
 27 |   /**
 28 |    * An instance of Logger for debug/info logs.
 29 |    */
 30 |   logger: Logger;
 31 | }
 32 | 
 33 | /**
 34 |  * ChatClient handles the WebSocket connection to the Twitter/Periscope chat API.
 35 |  * It emits events such as "speakerRequest", "occupancyUpdate", "muteStateChanged", etc.
 36 |  */
 37 | export class ChatClient extends EventEmitter {
 38 |   private ws?: WebSocket;
 39 |   private connected = false;
 40 | 
 41 |   private readonly logger: Logger;
 42 |   private readonly spaceId: string;
 43 |   private readonly accessToken: string;
 44 |   private endpoint: string;
 45 | 
 46 |   constructor(config: ChatClientConfig) {
 47 |     super();
 48 |     this.spaceId = config.spaceId;
 49 |     this.accessToken = config.accessToken;
 50 |     this.endpoint = config.endpoint;
 51 |     this.logger = config.logger;
 52 |   }
 53 | 
 54 |   /**
 55 |    * Establishes a WebSocket connection to the chat endpoint and sets up event handlers.
 56 |    */
 57 |   public async connect(): Promise<void> {
 58 |     const wsUrl = `${this.endpoint}/chatapi/v1/chatnow`.replace(
 59 |       'https://',
 60 |       'wss://',
 61 |     );
 62 |     this.logger.info('[ChatClient] Connecting =>', wsUrl);
 63 | 
 64 |     this.ws = new WebSocket(wsUrl, {
 65 |       headers: {
 66 |         Origin: 'https://x.com',
 67 |         'User-Agent': 'Mozilla/5.0',
 68 |       },
 69 |     });
 70 | 
 71 |     await this.setupHandlers();
 72 |   }
 73 | 
 74 |   /**
 75 |    * Internal method to set up WebSocket event listeners (open, message, close, error).
 76 |    */
 77 |   private setupHandlers(): Promise<void> {
 78 |     if (!this.ws) {
 79 |       throw new Error('[ChatClient] No WebSocket instance available');
 80 |     }
 81 | 
 82 |     return new Promise((resolve, reject) => {
 83 |       this.ws!.on('open', () => {
 84 |         this.logger.info('[ChatClient] Connected');
 85 |         this.connected = true;
 86 |         this.sendAuthAndJoin();
 87 |         resolve();
 88 |       });
 89 | 
 90 |       this.ws!.on('message', (data: { toString: () => string }) => {
 91 |         this.handleMessage(data.toString());
 92 |       });
 93 | 
 94 |       this.ws!.on('close', () => {
 95 |         this.logger.info('[ChatClient] Closed');
 96 |         this.connected = false;
 97 |         this.emit('disconnected');
 98 |       });
 99 | 
100 |       this.ws!.on('error', (err) => {
101 |         this.logger.error('[ChatClient] Error =>', err);
102 |         reject(err);
103 |       });
104 |     });
105 |   }
106 | 
107 |   /**
108 |    * Sends two WebSocket messages to authenticate and join the specified space.
109 |    */
110 |   private sendAuthAndJoin(): void {
111 |     if (!this.ws) return;
112 | 
113 |     // 1) Send authentication (access token)
114 |     this.ws.send(
115 |       JSON.stringify({
116 |         payload: JSON.stringify({ access_token: this.accessToken }),
117 |         kind: 3,
118 |       }),
119 |     );
120 | 
121 |     // 2) Send a "join" message specifying the room (space ID)
122 |     this.ws.send(
123 |       JSON.stringify({
124 |         payload: JSON.stringify({
125 |           body: JSON.stringify({ room: this.spaceId }),
126 |           kind: 1,
127 |         }),
128 |         kind: 2,
129 |       }),
130 |     );
131 |   }
132 | 
133 |   /**
134 |    * Sends an emoji reaction to the chat server.
135 |    * @param emoji - The emoji string, e.g. '🔥', '🙏', etc.
136 |    */
137 |   public reactWithEmoji(emoji: string): void {
138 |     if (!this.ws || !this.connected) {
139 |       this.logger.warn(
140 |         '[ChatClient] Not connected or WebSocket missing; ignoring reactWithEmoji.',
141 |       );
142 |       return;
143 |     }
144 | 
145 |     const payload = JSON.stringify({
146 |       body: JSON.stringify({ body: emoji, type: 2, v: 2 }),
147 |       kind: 1,
148 |       /*
149 |       // The 'sender' field is not required, it's not even verified by the server
150 |       // Instead of passing attributes down here it's easier to ignore it
151 |       sender: {
152 |         user_id: null,
153 |         twitter_id: null,
154 |         username: null,
155 |         display_name: null,
156 |       },
157 |       */
158 |       payload: JSON.stringify({
159 |         room: this.spaceId,
160 |         body: JSON.stringify({ body: emoji, type: 2, v: 2 }),
161 |       }),
162 |       type: 2,
163 |     });
164 | 
165 |     this.ws.send(payload);
166 |   }
167 | 
168 |   /**
169 |    * Handles inbound WebSocket messages, parsing JSON payloads
170 |    * and emitting relevant events (speakerRequest, occupancyUpdate, etc.).
171 |    */
172 |   private handleMessage(raw: string): void {
173 |     let msg: any;
174 |     try {
175 |       msg = JSON.parse(raw);
176 |     } catch {
177 |       return; // Invalid JSON, ignoring
178 |     }
179 |     if (!msg.payload) return;
180 | 
181 |     const payload = safeJson(msg.payload);
182 |     if (!payload?.body) return;
183 | 
184 |     const body = safeJson(payload.body);
185 | 
186 |     // 1) Speaker request => "guestBroadcastingEvent=1"
187 |     if (body.guestBroadcastingEvent === 1) {
188 |       const req: SpeakerRequest = {
189 |         userId: body.guestRemoteID,
190 |         username: body.guestUsername,
191 |         displayName: payload.sender?.display_name || body.guestUsername,
192 |         sessionUUID: body.sessionUUID,
193 |       };
194 |       this.emit('speakerRequest', req);
195 |     }
196 | 
197 |     // 2) Occupancy update => body.occupancy
198 |     if (typeof body.occupancy === 'number') {
199 |       const update: OccupancyUpdate = {
200 |         occupancy: body.occupancy,
201 |         totalParticipants: body.total_participants || 0,
202 |       };
203 |       this.emit('occupancyUpdate', update);
204 |     }
205 | 
206 |     // 3) Mute/unmute => "guestBroadcastingEvent=16" (mute) or "17" (unmute)
207 |     if (body.guestBroadcastingEvent === 16) {
208 |       this.emit('muteStateChanged', {
209 |         userId: body.guestRemoteID,
210 |         muted: true,
211 |       });
212 |     }
213 |     if (body.guestBroadcastingEvent === 17) {
214 |       this.emit('muteStateChanged', {
215 |         userId: body.guestRemoteID,
216 |         muted: false,
217 |       });
218 |     }
219 | 
220 |     // 4) "guestBroadcastingEvent=12" => host accepted a speaker
221 |     if (body.guestBroadcastingEvent === 12) {
222 |       this.emit('newSpeakerAccepted', {
223 |         userId: body.guestRemoteID,
224 |         username: body.guestUsername,
225 |         sessionUUID: body.sessionUUID,
226 |       });
227 |     }
228 | 
229 |     // 5) Reaction => body.type=2
230 |     if (body?.type === 2) {
231 |       this.logger.debug('[ChatClient] Emitting guestReaction =>', body);
232 |       this.emit('guestReaction', {
233 |         displayName: body.displayName,
234 |         emoji: body.body,
235 |       });
236 |     }
237 |   }
238 | 
239 |   /**
240 |    * Closes the WebSocket connection if open, and resets internal state.
241 |    */
242 |   public async disconnect(): Promise<void> {
243 |     if (this.ws) {
244 |       this.logger.info('[ChatClient] Disconnecting...');
245 |       this.ws.close();
246 |       this.ws = undefined;
247 |       this.connected = false;
248 |     }
249 |   }
250 | }
251 | 
252 | /**
253 |  * Helper function to safely parse JSON without throwing.
254 |  */
255 | function safeJson(text: string): any {
256 |   try {
257 |     return JSON.parse(text);
258 |   } catch {
259 |     return null;
260 |   }
261 | }
262 | 


--------------------------------------------------------------------------------
/src/spaces/core/JanusAudio.ts:
--------------------------------------------------------------------------------
  1 | // src/core/JanusAudio.ts
  2 | 
  3 | import { EventEmitter } from 'events';
  4 | import wrtc from '@roamhq/wrtc';
  5 | const { nonstandard } = wrtc;
  6 | const { RTCAudioSource, RTCAudioSink } = nonstandard;
  7 | import { Logger } from '../logger';
  8 | 
  9 | /**
 10 |  * Configuration options for the JanusAudioSource.
 11 |  */
 12 | interface AudioSourceOptions {
 13 |   /**
 14 |    * Optional logger instance for debug/info/warn logs.
 15 |    */
 16 |   logger?: Logger;
 17 | }
 18 | 
 19 | /**
 20 |  * Configuration options for the JanusAudioSink.
 21 |  */
 22 | interface AudioSinkOptions {
 23 |   /**
 24 |    * Optional logger instance for debug/info/warn logs.
 25 |    */
 26 |   logger?: Logger;
 27 | }
 28 | 
 29 | /**
 30 |  * JanusAudioSource wraps a RTCAudioSource, allowing you to push
 31 |  * raw PCM frames (Int16Array) into the WebRTC pipeline.
 32 |  */
 33 | export class JanusAudioSource extends EventEmitter {
 34 |   private source: any;
 35 |   private readonly track: MediaStreamTrack;
 36 |   private logger?: Logger;
 37 | 
 38 |   constructor(options?: AudioSourceOptions) {
 39 |     super();
 40 |     this.logger = options?.logger;
 41 |     this.source = new RTCAudioSource();
 42 |     this.track = this.source.createTrack();
 43 |   }
 44 | 
 45 |   /**
 46 |    * Returns the MediaStreamTrack associated with this audio source.
 47 |    */
 48 |   public getTrack(): MediaStreamTrack {
 49 |     return this.track;
 50 |   }
 51 | 
 52 |   /**
 53 |    * Pushes PCM data into the RTCAudioSource. Typically 16-bit, single- or multi-channel frames.
 54 |    * @param samples - The Int16Array audio samples.
 55 |    * @param sampleRate - The sampling rate (e.g., 48000).
 56 |    * @param channels - Number of channels (e.g., 1 for mono).
 57 |    */
 58 |   public pushPcmData(
 59 |     samples: Int16Array,
 60 |     sampleRate: number,
 61 |     channels = 1,
 62 |   ): void {
 63 |     if (this.logger?.isDebugEnabled()) {
 64 |       this.logger?.debug(
 65 |         `[JanusAudioSource] pushPcmData => sampleRate=${sampleRate}, channels=${channels}, frames=${samples.length}`,
 66 |       );
 67 |     }
 68 | 
 69 |     // Feed data into the RTCAudioSource
 70 |     this.source.onData({
 71 |       samples,
 72 |       sampleRate,
 73 |       bitsPerSample: 16,
 74 |       channelCount: channels,
 75 |       numberOfFrames: samples.length / channels,
 76 |     });
 77 |   }
 78 | }
 79 | 
 80 | /**
 81 |  * JanusAudioSink wraps a RTCAudioSink, providing an event emitter
 82 |  * that forwards raw PCM frames (Int16Array) to listeners.
 83 |  */
 84 | export class JanusAudioSink extends EventEmitter {
 85 |   private sink: any;
 86 |   private active = true;
 87 |   private logger?: Logger;
 88 | 
 89 |   constructor(track: MediaStreamTrack, options?: AudioSinkOptions) {
 90 |     super();
 91 |     this.logger = options?.logger;
 92 | 
 93 |     if (track.kind !== 'audio') {
 94 |       throw new Error('[JanusAudioSink] Provided track is not an audio track');
 95 |     }
 96 | 
 97 |     // Create RTCAudioSink to listen for PCM frames
 98 |     this.sink = new RTCAudioSink(track);
 99 | 
100 |     // Register callback for PCM frames
101 |     this.sink.ondata = (frame: {
102 |       samples: Int16Array;
103 |       sampleRate: number;
104 |       bitsPerSample: number;
105 |       channelCount: number;
106 |     }) => {
107 |       if (!this.active) return;
108 | 
109 |       if (this.logger?.isDebugEnabled()) {
110 |         this.logger?.debug(
111 |           `[JanusAudioSink] ondata => ` +
112 |             `sampleRate=${frame.sampleRate}, ` +
113 |             `bitsPerSample=${frame.bitsPerSample}, ` +
114 |             `channelCount=${frame.channelCount}, ` +
115 |             `frames=${frame.samples.length}`,
116 |         );
117 |       }
118 | 
119 |       // Emit 'audioData' event with the raw PCM frame
120 |       this.emit('audioData', frame);
121 |     };
122 |   }
123 | 
124 |   /**
125 |    * Stops receiving audio data. Once called, no further 'audioData' events will be emitted.
126 |    */
127 |   public stop(): void {
128 |     this.active = false;
129 |     if (this.logger?.isDebugEnabled()) {
130 |       this.logger?.debug('[JanusAudioSink] stop called => stopping the sink');
131 |     }
132 |     this.sink?.stop();
133 |   }
134 | }
135 | 


--------------------------------------------------------------------------------
/src/spaces/core/SpaceParticipant.ts:
--------------------------------------------------------------------------------
  1 | // src/core/SpaceParticipant.ts
  2 | 
  3 | import { EventEmitter } from 'events';
  4 | import { Logger } from '../logger';
  5 | import { ChatClient } from './ChatClient';
  6 | import { JanusClient } from './JanusClient';
  7 | import { Scraper } from '../../scraper';
  8 | import type {
  9 |   TurnServersInfo,
 10 |   Plugin,
 11 |   PluginRegistration,
 12 |   AudioDataWithUser,
 13 | } from '../types';
 14 | import {
 15 |   accessChat,
 16 |   authorizeToken,
 17 |   getTurnServers,
 18 |   muteSpeaker,
 19 |   negotiateGuestStream,
 20 |   setupCommonChatEvents,
 21 |   startWatching,
 22 |   stopWatching,
 23 |   submitSpeakerRequest,
 24 |   unmuteSpeaker,
 25 |   cancelSpeakerRequest,
 26 | } from '../utils';
 27 | 
 28 | interface SpaceParticipantConfig {
 29 |   spaceId: string;
 30 |   debug?: boolean;
 31 | }
 32 | 
 33 | /**
 34 |  * Manages joining an existing Space in listener mode,
 35 |  * and optionally becoming a speaker via WebRTC (Janus).
 36 |  */
 37 | export class SpaceParticipant extends EventEmitter {
 38 |   private readonly spaceId: string;
 39 |   private readonly debug: boolean;
 40 |   private readonly logger: Logger;
 41 | 
 42 |   // Basic auth/cookie data
 43 |   private cookie?: string;
 44 |   private authToken?: string;
 45 | 
 46 |   // Chat
 47 |   private chatJwtToken?: string;
 48 |   private chatToken?: string;
 49 |   private chatClient?: ChatClient;
 50 | 
 51 |   // Watch session
 52 |   private lifecycleToken?: string;
 53 |   private watchSession?: string;
 54 | 
 55 |   // HLS stream
 56 |   private hlsUrl?: string;
 57 | 
 58 |   // Speaker request + Janus
 59 |   private sessionUUID?: string;
 60 |   private janusJwt?: string;
 61 |   private webrtcGwUrl?: string;
 62 |   private janusClient?: JanusClient;
 63 | 
 64 |   // Plugin management
 65 |   private plugins = new Set<PluginRegistration>();
 66 | 
 67 |   constructor(
 68 |     private readonly scraper: Scraper,
 69 |     config: SpaceParticipantConfig,
 70 |   ) {
 71 |     super();
 72 |     this.spaceId = config.spaceId;
 73 |     this.debug = config.debug ?? false;
 74 |     this.logger = new Logger(this.debug);
 75 |   }
 76 | 
 77 |   /**
 78 |    * Adds a plugin and calls its onAttach immediately.
 79 |    * init() or onJanusReady() will be invoked later at the appropriate time.
 80 |    */
 81 |   public use(plugin: Plugin, config?: Record<string, any>) {
 82 |     const registration: PluginRegistration = { plugin, config };
 83 |     this.plugins.add(registration);
 84 | 
 85 |     this.logger.debug(
 86 |       '[SpaceParticipant] Plugin added =>',
 87 |       plugin.constructor.name,
 88 |     );
 89 | 
 90 |     // Call the plugin's onAttach if it exists
 91 |     plugin.onAttach?.({ space: this, pluginConfig: config });
 92 | 
 93 |     return this;
 94 |   }
 95 | 
 96 |   /**
 97 |    * Joins the Space as a listener: obtains HLS, chat token, etc.
 98 |    */
 99 |   public async joinAsListener(): Promise<void> {
100 |     this.logger.info(
101 |       '[SpaceParticipant] Joining space as listener =>',
102 |       this.spaceId,
103 |     );
104 | 
105 |     // 1) Get cookie and authorize
106 |     this.cookie = await this.scraper.getPeriscopeCookie();
107 |     this.authToken = await authorizeToken(this.cookie);
108 | 
109 |     // 2) Retrieve the space metadata for mediaKey
110 |     const spaceMeta = await this.scraper.getAudioSpaceById(this.spaceId);
111 |     const mediaKey = spaceMeta?.metadata?.media_key;
112 |     if (!mediaKey) {
113 |       throw new Error('[SpaceParticipant] No mediaKey found in metadata');
114 |     }
115 |     this.logger.debug('[SpaceParticipant] mediaKey =>', mediaKey);
116 | 
117 |     // 3) Query live_video_stream/status for HLS URL and chat token
118 |     const status = await this.scraper.getAudioSpaceStreamStatus(mediaKey);
119 |     this.hlsUrl = status?.source?.location;
120 |     this.chatJwtToken = status?.chatToken;
121 |     this.lifecycleToken = status?.lifecycleToken;
122 |     this.logger.debug('[SpaceParticipant] HLS =>', this.hlsUrl);
123 | 
124 |     // 4) Access the chat
125 |     if (!this.chatJwtToken) {
126 |       throw new Error('[SpaceParticipant] No chatToken found');
127 |     }
128 |     const chatInfo = await accessChat(this.chatJwtToken, this.cookie!);
129 |     this.chatToken = chatInfo.access_token;
130 | 
131 |     // 5) Create and connect the ChatClient
132 |     this.chatClient = new ChatClient({
133 |       spaceId: chatInfo.room_id,
134 |       accessToken: chatInfo.access_token,
135 |       endpoint: chatInfo.endpoint,
136 |       logger: this.logger,
137 |     });
138 |     await this.chatClient.connect();
139 |     this.setupChatEvents();
140 | 
141 |     // 6) startWatching (to appear as a viewer)
142 |     this.watchSession = await startWatching(this.lifecycleToken!, this.cookie!);
143 | 
144 |     this.logger.info('[SpaceParticipant] Joined as listener.');
145 | 
146 |     // Call plugin.init(...) now that we have basic "listener" mode set up
147 |     for (const { plugin, config } of this.plugins) {
148 |       plugin.init?.({ space: this, pluginConfig: config });
149 |     }
150 |   }
151 | 
152 |   /**
153 |    * Returns the HLS URL if you want to consume the stream as a listener.
154 |    */
155 |   public getHlsUrl(): string | undefined {
156 |     return this.hlsUrl;
157 |   }
158 | 
159 |   /**
160 |    * Submits a speaker request using /audiospace/request/submit.
161 |    * Returns the sessionUUID used to track approval.
162 |    */
163 |   public async requestSpeaker(): Promise<{ sessionUUID: string }> {
164 |     if (!this.chatJwtToken) {
165 |       throw new Error(
166 |         '[SpaceParticipant] Must join as listener first (no chat token).',
167 |       );
168 |     }
169 |     if (!this.authToken) {
170 |       throw new Error('[SpaceParticipant] No auth token available.');
171 |     }
172 |     if (!this.chatToken) {
173 |       throw new Error('[SpaceParticipant] No chat token available.');
174 |     }
175 | 
176 |     this.logger.info('[SpaceParticipant] Submitting speaker request...');
177 | 
178 |     const { session_uuid } = await submitSpeakerRequest({
179 |       broadcastId: this.spaceId,
180 |       chatToken: this.chatToken,
181 |       authToken: this.authToken,
182 |     });
183 |     this.sessionUUID = session_uuid;
184 | 
185 |     this.logger.info(
186 |       '[SpaceParticipant] Speaker request submitted =>',
187 |       session_uuid,
188 |     );
189 |     return { sessionUUID: session_uuid };
190 |   }
191 | 
192 |   /**
193 |    * Cancels a previously submitted speaker request using /audiospace/request/cancel.
194 |    * This requires a valid sessionUUID from requestSpeaker() first.
195 |    */
196 |   public async cancelSpeakerRequest(): Promise<void> {
197 |     if (!this.sessionUUID) {
198 |       throw new Error(
199 |         '[SpaceParticipant] No sessionUUID; cannot cancel a speaker request that was never submitted.',
200 |       );
201 |     }
202 |     if (!this.authToken) {
203 |       throw new Error('[SpaceParticipant] No auth token available.');
204 |     }
205 |     if (!this.chatToken) {
206 |       throw new Error('[SpaceParticipant] No chat token available.');
207 |     }
208 | 
209 |     await cancelSpeakerRequest({
210 |       broadcastId: this.spaceId,
211 |       sessionUUID: this.sessionUUID,
212 |       chatToken: this.chatToken,
213 |       authToken: this.authToken,
214 |     });
215 | 
216 |     this.logger.info(
217 |       '[SpaceParticipant] Speaker request canceled =>',
218 |       this.sessionUUID,
219 |     );
220 |     this.sessionUUID = undefined;
221 |   }
222 | 
223 |   /**
224 |    * Once the host approves our speaker request, we perform Janus negotiation
225 |    * to become a speaker.
226 |    */
227 |   public async becomeSpeaker(): Promise<void> {
228 |     if (!this.sessionUUID) {
229 |       throw new Error(
230 |         '[SpaceParticipant] No sessionUUID (did you call requestSpeaker()?).',
231 |       );
232 |     }
233 |     this.logger.info(
234 |       '[SpaceParticipant] Negotiating speaker role via Janus...',
235 |     );
236 | 
237 |     // 1) Retrieve TURN servers
238 |     const turnServers: TurnServersInfo = await getTurnServers(this.cookie!);
239 |     this.logger.debug('[SpaceParticipant] turnServers =>', turnServers);
240 | 
241 |     // 2) Negotiate with /audiospace/stream/negotiate
242 |     const nego = await negotiateGuestStream({
243 |       broadcastId: this.spaceId,
244 |       sessionUUID: this.sessionUUID,
245 |       authToken: this.authToken!,
246 |       cookie: this.cookie!,
247 |     });
248 |     this.janusJwt = nego.janus_jwt;
249 |     this.webrtcGwUrl = nego.webrtc_gw_url;
250 |     this.logger.debug('[SpaceParticipant] webrtcGwUrl =>', this.webrtcGwUrl);
251 | 
252 |     // 3) Create JanusClient
253 |     this.janusClient = new JanusClient({
254 |       webrtcUrl: this.webrtcGwUrl!,
255 |       roomId: this.spaceId,
256 |       credential: this.janusJwt!,
257 |       userId: turnServers.username.split(':')[1],
258 |       streamName: this.spaceId,
259 |       turnServers,
260 |       logger: this.logger,
261 |     });
262 | 
263 |     // 4) Initialize the guest speaker session in Janus
264 |     await this.janusClient.initializeGuestSpeaker(this.sessionUUID);
265 | 
266 |     this.janusClient.on('audioDataFromSpeaker', (data: AudioDataWithUser) => {
267 |       this.logger.debug(
268 |         '[SpaceParticipant] Received speaker audio =>',
269 |         data.userId,
270 |       );
271 |       this.handleAudioData(data);
272 |     });
273 | 
274 |     this.logger.info(
275 |       '[SpaceParticipant] Now speaker on the Space =>',
276 |       this.spaceId,
277 |     );
278 | 
279 |     // For plugins that need direct Janus references, call onJanusReady
280 |     for (const { plugin } of this.plugins) {
281 |       plugin.onJanusReady?.(this.janusClient);
282 |     }
283 |   }
284 | 
285 |   /**
286 |    * Leaves the Space gracefully:
287 |    * - Stop Janus if we were a speaker
288 |    * - Stop watching as a viewer
289 |    * - Disconnect chat
290 |    */
291 |   public async leaveSpace(): Promise<void> {
292 |     this.logger.info('[SpaceParticipant] Leaving space...');
293 | 
294 |     // If speaker, stop Janus
295 |     if (this.janusClient) {
296 |       await this.janusClient.stop();
297 |       this.janusClient = undefined;
298 |     }
299 | 
300 |     // Stop watching
301 |     if (this.watchSession && this.cookie) {
302 |       await stopWatching(this.watchSession, this.cookie);
303 |     }
304 | 
305 |     // Disconnect chat
306 |     if (this.chatClient) {
307 |       await this.chatClient.disconnect();
308 |       this.chatClient = undefined;
309 |     }
310 | 
311 |     this.logger.info('[SpaceParticipant] Left space =>', this.spaceId);
312 |   }
313 | 
314 |   /**
315 |    * Pushes PCM audio frames if we're speaker; otherwise logs a warning.
316 |    */
317 |   public pushAudio(samples: Int16Array, sampleRate: number) {
318 |     if (!this.janusClient) {
319 |       this.logger.warn(
320 |         '[SpaceParticipant] Not a speaker yet; ignoring pushAudio.',
321 |       );
322 |       return;
323 |     }
324 |     this.janusClient.pushLocalAudio(samples, sampleRate);
325 |   }
326 | 
327 |   /**
328 |    * Internal handler for incoming PCM frames from Janus, forwarded to plugin.onAudioData if present.
329 |    */
330 |   private handleAudioData(data: AudioDataWithUser) {
331 |     for (const { plugin } of this.plugins) {
332 |       plugin.onAudioData?.(data);
333 |     }
334 |   }
335 | 
336 |   /**
337 |    * Sets up chat events: "occupancyUpdate", "newSpeakerAccepted", etc.
338 |    */
339 |   private setupChatEvents() {
340 |     if (!this.chatClient) return;
341 |     setupCommonChatEvents(this.chatClient, this.logger, this);
342 | 
343 |     this.chatClient.on('newSpeakerAccepted', ({ userId }) => {
344 |       this.logger.debug('[SpaceParticipant] newSpeakerAccepted =>', userId);
345 | 
346 |       // If we haven't created Janus yet, skip
347 |       if (!this.janusClient) {
348 |         this.logger.warn(
349 |           '[SpaceParticipant] No janusClient yet; ignoring new speaker...',
350 |         );
351 |         return;
352 |       }
353 |       // If this is our own handle, skip
354 |       if (userId === this.janusClient.getHandleId()) {
355 |         return;
356 |       }
357 | 
358 |       // Subscribe to this new speaker's audio
359 |       this.janusClient.subscribeSpeaker(userId).catch((err) => {
360 |         this.logger.error('[SpaceParticipant] subscribeSpeaker error =>', err);
361 |       });
362 |     });
363 |   }
364 | 
365 |   /**
366 |    * Mute self if we are speaker: calls /audiospace/muteSpeaker with our sessionUUID.
367 |    */
368 |   public async muteSelf(): Promise<void> {
369 |     if (!this.authToken || !this.chatToken) {
370 |       throw new Error('[SpaceParticipant] Missing authToken or chatToken.');
371 |     }
372 |     if (!this.sessionUUID) {
373 |       throw new Error('[SpaceParticipant] No sessionUUID; are you a speaker?');
374 |     }
375 | 
376 |     await muteSpeaker({
377 |       broadcastId: this.spaceId,
378 |       sessionUUID: this.sessionUUID,
379 |       chatToken: this.chatToken,
380 |       authToken: this.authToken,
381 |     });
382 |     this.logger.info('[SpaceParticipant] Successfully muted self.');
383 |   }
384 | 
385 |   /**
386 |    * Unmute self if we are speaker: calls /audiospace/unmuteSpeaker with our sessionUUID.
387 |    */
388 |   public async unmuteSelf(): Promise<void> {
389 |     if (!this.authToken || !this.chatToken) {
390 |       throw new Error('[SpaceParticipant] Missing authToken or chatToken.');
391 |     }
392 |     if (!this.sessionUUID) {
393 |       throw new Error('[SpaceParticipant] No sessionUUID; are you a speaker?');
394 |     }
395 | 
396 |     await unmuteSpeaker({
397 |       broadcastId: this.spaceId,
398 |       sessionUUID: this.sessionUUID,
399 |       chatToken: this.chatToken,
400 |       authToken: this.authToken,
401 |     });
402 |     this.logger.info('[SpaceParticipant] Successfully unmuted self.');
403 |   }
404 | }
405 | 


--------------------------------------------------------------------------------
/src/spaces/logger.ts:
--------------------------------------------------------------------------------
 1 | // src/logger.ts
 2 | 
 3 | export class Logger {
 4 |   private readonly debugEnabled: boolean;
 5 | 
 6 |   constructor(debugEnabled: boolean) {
 7 |     this.debugEnabled = debugEnabled;
 8 |   }
 9 | 
10 |   info(msg: string, ...args: any[]) {
11 |     console.log(msg, ...args);
12 |   }
13 | 
14 |   debug(msg: string, ...args: any[]) {
15 |     if (this.debugEnabled) {
16 |       console.log(msg, ...args);
17 |     }
18 |   }
19 | 
20 |   warn(msg: string, ...args: any[]) {
21 |     console.warn('[WARN]', msg, ...args);
22 |   }
23 | 
24 |   error(msg: string, ...args: any[]) {
25 |     console.error(msg, ...args);
26 |   }
27 | 
28 |   isDebugEnabled(): boolean {
29 |     return this.debugEnabled;
30 |   }
31 | }
32 | 


--------------------------------------------------------------------------------
/src/spaces/plugins/HlsRecordPlugin.ts:
--------------------------------------------------------------------------------
  1 | import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
  2 | import { Plugin, OccupancyUpdate } from '../types';
  3 | import { Space } from '../core/Space';
  4 | import { Logger } from '../logger';
  5 | 
  6 | /**
  7 |  * HlsRecordPlugin
  8 |  * ---------------
  9 |  * Records the final Twitter Spaces HLS mix to a local .ts file using ffmpeg.
 10 |  *
 11 |  * Workflow:
 12 |  *  - Wait for occupancy > 0 (i.e., at least one listener).
 13 |  *  - Attempt to retrieve the HLS URL from Twitter (via scraper).
 14 |  *  - If valid (HTTP 200), spawn ffmpeg to record the stream.
 15 |  *  - If HLS not ready yet (HTTP 404), wait for next occupancy event.
 16 |  *
 17 |  * Lifecycle:
 18 |  *  - onAttach(...) => minimal references, logger setup
 19 |  *  - init(...) => fully runs once the Space is created (broadcastInfo ready)
 20 |  *  - cleanup() => stop ffmpeg if running
 21 |  */
 22 | export class HlsRecordPlugin implements Plugin {
 23 |   private logger?: Logger;
 24 |   private recordingProcess?: ChildProcessWithoutNullStreams;
 25 |   private isRecording = false;
 26 | 
 27 |   private outputPath?: string;
 28 |   private mediaKey?: string;
 29 |   private space?: Space;
 30 | 
 31 |   /**
 32 |    * You can optionally provide an outputPath in the constructor.
 33 |    * Alternatively, it can be set via pluginConfig in onAttach/init.
 34 |    */
 35 |   constructor(outputPath?: string) {
 36 |     this.outputPath = outputPath;
 37 |   }
 38 | 
 39 |   /**
 40 |    * Called immediately after .use(plugin). We store references here
 41 |    * (e.g., the space) and create a Logger based on pluginConfig.debug.
 42 |    */
 43 |   onAttach(params: { space: Space; pluginConfig?: Record<string, any> }): void {
 44 |     this.space = params.space;
 45 | 
 46 |     const debug = params.pluginConfig?.debug ?? false;
 47 |     this.logger = new Logger(debug);
 48 | 
 49 |     this.logger.info('[HlsRecordPlugin] onAttach => plugin attached');
 50 | 
 51 |     // If outputPath was not passed in constructor, check pluginConfig
 52 |     if (params.pluginConfig?.outputPath) {
 53 |       this.outputPath = params.pluginConfig.outputPath;
 54 |     }
 55 |   }
 56 | 
 57 |   /**
 58 |    * Called once the Space has fully initialized (broadcastInfo is ready).
 59 |    * We retrieve the media_key from the broadcast, subscribe to occupancy,
 60 |    * and prepare for recording if occupancy > 0.
 61 |    */
 62 |   async init(params: { space: Space; pluginConfig?: Record<string, any> }) {
 63 |     // Merge plugin config again (in case it was not set in onAttach).
 64 |     if (params.pluginConfig?.outputPath) {
 65 |       this.outputPath = params.pluginConfig.outputPath;
 66 |     }
 67 | 
 68 |     // Use the same logger from onAttach
 69 |     const broadcastInfo = (this.space as any)?.broadcastInfo;
 70 |     if (!broadcastInfo || !broadcastInfo.broadcast?.media_key) {
 71 |       this.logger?.warn(
 72 |         '[HlsRecordPlugin] No media_key found in broadcastInfo',
 73 |       );
 74 |       return;
 75 |     }
 76 |     this.mediaKey = broadcastInfo.broadcast.media_key;
 77 | 
 78 |     // If no custom output path was provided, use a default
 79 |     const roomId = broadcastInfo.room_id || 'unknown_room';
 80 |     if (!this.outputPath) {
 81 |       this.outputPath = `/tmp/record_${roomId}.ts`;
 82 |     }
 83 | 
 84 |     this.logger?.info(
 85 |       `[HlsRecordPlugin] init => ready to record. Output path="${this.outputPath}"`,
 86 |     );
 87 | 
 88 |     // Listen for occupancy updates
 89 |     this.space?.on('occupancyUpdate', (update: OccupancyUpdate) => {
 90 |       this.handleOccupancyUpdate(update).catch((err) => {
 91 |         this.logger?.error('[HlsRecordPlugin] handleOccupancyUpdate =>', err);
 92 |       });
 93 |     });
 94 |   }
 95 | 
 96 |   /**
 97 |    * If occupancy > 0 and we're not recording yet, attempt to fetch the HLS URL
 98 |    * from Twitter. If it's ready, spawn ffmpeg to record.
 99 |    */
100 |   private async handleOccupancyUpdate(update: OccupancyUpdate) {
101 |     if (!this.space || !this.mediaKey) return;
102 |     if (this.isRecording) return;
103 |     if (update.occupancy <= 0) {
104 |       this.logger?.debug('[HlsRecordPlugin] occupancy=0 => ignoring');
105 |       return;
106 |     }
107 | 
108 |     this.logger?.debug(
109 |       `[HlsRecordPlugin] occupancy=${update.occupancy} => trying to fetch HLS URL...`,
110 |     );
111 | 
112 |     const scraper = (this.space as any).scraper;
113 |     if (!scraper) {
114 |       this.logger?.warn('[HlsRecordPlugin] No scraper found on space');
115 |       return;
116 |     }
117 | 
118 |     try {
119 |       const status = await scraper.getAudioSpaceStreamStatus(this.mediaKey);
120 |       if (!status?.source?.location) {
121 |         this.logger?.debug(
122 |           '[HlsRecordPlugin] occupancy>0 but no HLS URL => wait next update',
123 |         );
124 |         return;
125 |       }
126 | 
127 |       const hlsUrl = status.source.location;
128 |       const isReady = await this.waitForHlsReady(hlsUrl, 1);
129 |       if (!isReady) {
130 |         this.logger?.debug(
131 |           '[HlsRecordPlugin] HLS URL 404 => waiting next occupancy update...',
132 |         );
133 |         return;
134 |       }
135 |       await this.startRecording(hlsUrl);
136 |     } catch (err) {
137 |       this.logger?.error('[HlsRecordPlugin] handleOccupancyUpdate =>', err);
138 |     }
139 |   }
140 | 
141 |   /**
142 |    * HEAD request to see if the HLS URL is returning 200 OK.
143 |    * maxRetries=1 => only try once here; rely on occupancy re-calls otherwise.
144 |    */
145 |   private async waitForHlsReady(
146 |     hlsUrl: string,
147 |     maxRetries: number,
148 |   ): Promise<boolean> {
149 |     let attempt = 0;
150 |     while (attempt < maxRetries) {
151 |       try {
152 |         const resp = await fetch(hlsUrl, { method: 'HEAD' });
153 |         if (resp.ok) {
154 |           this.logger?.debug(
155 |             `[HlsRecordPlugin] HLS is ready (attempt #${attempt + 1})`,
156 |           );
157 |           return true;
158 |         } else {
159 |           this.logger?.debug(
160 |             `[HlsRecordPlugin] HLS status=${resp.status}, retrying...`,
161 |           );
162 |         }
163 |       } catch (error) {
164 |         this.logger?.debug(
165 |           '[HlsRecordPlugin] HLS fetch error =>',
166 |           (error as Error).message,
167 |         );
168 |       }
169 |       attempt++;
170 |       await new Promise((r) => setTimeout(r, 2000));
171 |     }
172 |     return false;
173 |   }
174 | 
175 |   /**
176 |    * Spawns ffmpeg to record the HLS stream at the given URL.
177 |    */
178 |   private async startRecording(hlsUrl: string): Promise<void> {
179 |     if (this.isRecording) {
180 |       this.logger?.debug('[HlsRecordPlugin] Already recording, skipping...');
181 |       return;
182 |     }
183 |     this.isRecording = true;
184 | 
185 |     if (!this.outputPath) {
186 |       this.logger?.warn(
187 |         '[HlsRecordPlugin] No output path set, using /tmp/space_record.ts',
188 |       );
189 |       this.outputPath = '/tmp/space_record.ts';
190 |     }
191 | 
192 |     this.logger?.info('[HlsRecordPlugin] Starting HLS recording =>', hlsUrl);
193 | 
194 |     this.recordingProcess = spawn('ffmpeg', [
195 |       '-y',
196 |       '-i',
197 |       hlsUrl,
198 |       '-c',
199 |       'copy',
200 |       this.outputPath,
201 |     ]);
202 | 
203 |     // Capture stderr for errors or debug info
204 |     this.recordingProcess.stderr.on('data', (chunk) => {
205 |       const msg = chunk.toString();
206 |       if (msg.toLowerCase().includes('error')) {
207 |         this.logger?.error('[HlsRecordPlugin][ffmpeg error] =>', msg.trim());
208 |       } else {
209 |         this.logger?.debug('[HlsRecordPlugin][ffmpeg]', msg.trim());
210 |       }
211 |     });
212 | 
213 |     this.recordingProcess.on('close', (code) => {
214 |       this.isRecording = false;
215 |       this.logger?.info(
216 |         '[HlsRecordPlugin] Recording process closed => code=',
217 |         code,
218 |       );
219 |     });
220 | 
221 |     this.recordingProcess.on('error', (err) => {
222 |       this.logger?.error('[HlsRecordPlugin] Recording process failed =>', err);
223 |     });
224 |   }
225 | 
226 |   /**
227 |    * Called when the plugin is cleaned up (e.g. space.stop()).
228 |    * Kills ffmpeg if still running.
229 |    */
230 |   cleanup(): void {
231 |     if (this.isRecording && this.recordingProcess) {
232 |       this.logger?.info('[HlsRecordPlugin] Stopping HLS recording...');
233 |       this.recordingProcess.kill();
234 |       this.recordingProcess = undefined;
235 |       this.isRecording = false;
236 |     }
237 |   }
238 | }
239 | 


--------------------------------------------------------------------------------
/src/spaces/plugins/IdleMonitorPlugin.ts:
--------------------------------------------------------------------------------
  1 | import { Plugin, AudioDataWithUser } from '../types';
  2 | import { Space } from '../core/Space';
  3 | import { Logger } from '../logger';
  4 | 
  5 | /**
  6 |  * IdleMonitorPlugin
  7 |  * -----------------
  8 |  * Monitors silence in both remote speaker audio and local (pushed) audio.
  9 |  * If no audio is detected for a specified duration, it emits an 'idleTimeout' event on the space.
 10 |  */
 11 | export class IdleMonitorPlugin implements Plugin {
 12 |   private space?: Space;
 13 |   private logger?: Logger;
 14 | 
 15 |   private lastSpeakerAudioMs = Date.now();
 16 |   private lastLocalAudioMs = Date.now();
 17 |   private checkInterval?: NodeJS.Timeout;
 18 | 
 19 |   /**
 20 |    * @param idleTimeoutMs The duration (in ms) of total silence before triggering idle. (Default: 60s)
 21 |    * @param checkEveryMs  How frequently (in ms) to check for silence. (Default: 10s)
 22 |    */
 23 |   constructor(
 24 |     private idleTimeoutMs: number = 60_000,
 25 |     private checkEveryMs: number = 10_000,
 26 |   ) {}
 27 | 
 28 |   /**
 29 |    * Called immediately after .use(plugin).
 30 |    * Allows for minimal setup, including obtaining a debug logger if desired.
 31 |    */
 32 |   onAttach(params: { space: Space; pluginConfig?: Record<string, any> }): void {
 33 |     this.space = params.space;
 34 |     const debug = params.pluginConfig?.debug ?? false;
 35 |     this.logger = new Logger(debug);
 36 | 
 37 |     this.logger.info('[IdleMonitorPlugin] onAttach => plugin attached');
 38 |   }
 39 | 
 40 |   /**
 41 |    * Called once the space has fully initialized (basic mode).
 42 |    * We set up idle checks and override pushAudio to detect local audio activity.
 43 |    */
 44 |   init(params: { space: Space; pluginConfig?: Record<string, any> }): void {
 45 |     this.space = params.space;
 46 |     this.logger?.info('[IdleMonitorPlugin] init => setting up idle checks');
 47 | 
 48 |     // Update lastSpeakerAudioMs on incoming speaker audio
 49 |     // (Here we're hooking into an event triggered by Space for each speaker's PCM data.)
 50 |     this.space.on('audioDataFromSpeaker', (_data: AudioDataWithUser) => {
 51 |       this.lastSpeakerAudioMs = Date.now();
 52 |     });
 53 | 
 54 |     // Patch space.pushAudio to track local audio
 55 |     const originalPushAudio = this.space.pushAudio.bind(this.space);
 56 |     this.space.pushAudio = (samples, sampleRate) => {
 57 |       this.lastLocalAudioMs = Date.now();
 58 |       originalPushAudio(samples, sampleRate);
 59 |     };
 60 | 
 61 |     // Periodically check for silence
 62 |     this.checkInterval = setInterval(() => this.checkIdle(), this.checkEveryMs);
 63 |   }
 64 | 
 65 |   /**
 66 |    * Checks if we've exceeded idleTimeoutMs with no audio activity.
 67 |    * If so, emits an 'idleTimeout' event on the space with { idleMs } info.
 68 |    */
 69 |   private checkIdle() {
 70 |     const now = Date.now();
 71 |     const lastAudio = Math.max(this.lastSpeakerAudioMs, this.lastLocalAudioMs);
 72 |     const idleMs = now - lastAudio;
 73 | 
 74 |     if (idleMs >= this.idleTimeoutMs) {
 75 |       this.logger?.warn(
 76 |         `[IdleMonitorPlugin] idleTimeout => no audio for ${idleMs}ms`,
 77 |       );
 78 |       this.space?.emit('idleTimeout', { idleMs });
 79 |     }
 80 |   }
 81 | 
 82 |   /**
 83 |    * Returns how many milliseconds have passed since any audio was detected (local or speaker).
 84 |    */
 85 |   public getIdleTimeMs(): number {
 86 |     const now = Date.now();
 87 |     const lastAudio = Math.max(this.lastSpeakerAudioMs, this.lastLocalAudioMs);
 88 |     return now - lastAudio;
 89 |   }
 90 | 
 91 |   /**
 92 |    * Cleans up resources (interval) when the plugin is removed or space stops.
 93 |    */
 94 |   cleanup(): void {
 95 |     this.logger?.info('[IdleMonitorPlugin] cleanup => stopping idle checks');
 96 |     if (this.checkInterval) {
 97 |       clearInterval(this.checkInterval);
 98 |       this.checkInterval = undefined;
 99 |     }
100 |   }
101 | }
102 | 


--------------------------------------------------------------------------------
/src/spaces/plugins/MonitorAudioPlugin.ts:
--------------------------------------------------------------------------------
 1 | import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
 2 | import { Plugin, AudioDataWithUser } from '../types';
 3 | import { Logger } from '../logger';
 4 | 
 5 | /**
 6 |  * MonitorAudioPlugin
 7 |  * ------------------
 8 |  * A simple plugin that spawns an `ffplay` process to play raw PCM audio in real time.
 9 |  * It reads frames from `onAudioData()` and writes them to ffplay via stdin.
10 |  *
11 |  * Usage:
12 |  *   const plugin = new MonitorAudioPlugin(48000, /* debug= *\/ true);
13 |  *   space.use(plugin);
14 |  */
15 | export class MonitorAudioPlugin implements Plugin {
16 |   private ffplay?: ChildProcessWithoutNullStreams;
17 |   private logger: Logger;
18 | 
19 |   /**
20 |    * @param sampleRate  The expected PCM sample rate (e.g. 16000 or 48000).
21 |    * @param debug       If true, enables debug logging via Logger.
22 |    */
23 |   constructor(private readonly sampleRate = 48000, debug = false) {
24 |     this.logger = new Logger(debug);
25 | 
26 |     // Spawn ffplay to read raw PCM (s16le) on stdin
27 |     this.ffplay = spawn('ffplay', [
28 |       '-f',
29 |       's16le',
30 |       '-ar',
31 |       this.sampleRate.toString(),
32 |       '-ac',
33 |       '1', // mono
34 |       '-nodisp',
35 |       '-loglevel',
36 |       'quiet',
37 |       '-i',
38 |       'pipe:0',
39 |     ]);
40 | 
41 |     this.ffplay.on('error', (err) => {
42 |       this.logger.error('[MonitorAudioPlugin] ffplay error =>', err);
43 |     });
44 | 
45 |     this.ffplay.on('close', (code) => {
46 |       this.logger.info('[MonitorAudioPlugin] ffplay closed => code=', code);
47 |       this.ffplay = undefined;
48 |     });
49 | 
50 |     this.logger.info(
51 |       `[MonitorAudioPlugin] Started ffplay for real-time monitoring (sampleRate=${this.sampleRate})`,
52 |     );
53 |   }
54 | 
55 |   /**
56 |    * Called whenever PCM frames arrive (from a speaker).
57 |    * Writes frames to ffplay's stdin to play them in real time.
58 |    */
59 |   onAudioData(data: AudioDataWithUser): void {
60 |     // Log debug info
61 |     this.logger.debug(
62 |       `[MonitorAudioPlugin] onAudioData => userId=${data.userId}, samples=${data.samples.length}, sampleRate=${data.sampleRate}`,
63 |     );
64 | 
65 |     if (!this.ffplay?.stdin.writable) {
66 |       return;
67 |     }
68 | 
69 |     // In this plugin, we assume data.sampleRate matches our expected sampleRate.
70 |     // Convert the Int16Array to a Buffer, then write to ffplay stdin.
71 |     const pcmBuffer = Buffer.from(data.samples.buffer);
72 |     this.ffplay.stdin.write(pcmBuffer);
73 |   }
74 | 
75 |   /**
76 |    * Cleanup is called when the plugin is removed or when the space/participant stops.
77 |    * Ends the ffplay process and closes its stdin pipe.
78 |    */
79 |   cleanup(): void {
80 |     this.logger.info('[MonitorAudioPlugin] Cleanup => stopping ffplay');
81 |     if (this.ffplay) {
82 |       this.ffplay.stdin.end();
83 |       this.ffplay.kill();
84 |       this.ffplay = undefined;
85 |     }
86 |   }
87 | }
88 | 


--------------------------------------------------------------------------------
/src/spaces/plugins/RecordToDiskPlugin.ts:
--------------------------------------------------------------------------------
 1 | import * as fs from 'fs';
 2 | import { AudioDataWithUser, Plugin } from '../types';
 3 | import { Space } from '../core/Space';
 4 | import { SpaceParticipant } from '../core/SpaceParticipant';
 5 | import { Logger } from '../logger';
 6 | 
 7 | interface RecordToDiskPluginConfig {
 8 |   filePath?: string;
 9 |   debug?: boolean; // whether to enable verbose logs
10 | }
11 | 
12 | /**
13 |  * RecordToDiskPlugin
14 |  * ------------------
15 |  * A simple plugin that writes all incoming PCM frames to a local .raw file.
16 |  *
17 |  * Lifecycle:
18 |  *  - onAttach(...) => minimal references, logger config
19 |  *  - init(...) => finalize file path, open stream
20 |  *  - onAudioData(...) => append PCM frames to the file
21 |  *  - cleanup(...) => close file stream
22 |  */
23 | export class RecordToDiskPlugin implements Plugin {
24 |   private filePath: string = '/tmp/speaker_audio.raw';
25 |   private outStream?: fs.WriteStream;
26 |   private logger?: Logger;
27 | 
28 |   /**
29 |    * Called immediately after .use(plugin).
30 |    * We create a logger based on pluginConfig.debug and store the file path if provided.
31 |    */
32 |   onAttach(params: {
33 |     space: Space | SpaceParticipant;
34 |     pluginConfig?: Record<string, any>;
35 |   }): void {
36 |     const debugEnabled = params.pluginConfig?.debug ?? false;
37 |     this.logger = new Logger(debugEnabled);
38 | 
39 |     this.logger.info('[RecordToDiskPlugin] onAttach => plugin attached');
40 | 
41 |     if (params.pluginConfig?.filePath) {
42 |       this.filePath = params.pluginConfig.filePath;
43 |     }
44 |     this.logger.debug('[RecordToDiskPlugin] Using filePath =>', this.filePath);
45 |   }
46 | 
47 |   /**
48 |    * Called after the space/participant has joined in basic mode.
49 |    * We open the WriteStream to our file path here.
50 |    */
51 |   init(params: {
52 |     space: Space | SpaceParticipant;
53 |     pluginConfig?: Record<string, any>;
54 |   }): void {
55 |     // If filePath was re-defined in pluginConfig, re-check:
56 |     if (params.pluginConfig?.filePath) {
57 |       this.filePath = params.pluginConfig.filePath;
58 |     }
59 | 
60 |     this.logger?.info('[RecordToDiskPlugin] init => opening output stream');
61 |     this.outStream = fs.createWriteStream(this.filePath, { flags: 'w' });
62 |   }
63 | 
64 |   /**
65 |    * Called whenever PCM audio frames arrive from a speaker.
66 |    * We write them to the file as raw 16-bit PCM.
67 |    */
68 |   onAudioData(data: AudioDataWithUser): void {
69 |     if (!this.outStream) {
70 |       this.logger?.warn('[RecordToDiskPlugin] No outStream yet; ignoring data');
71 |       return;
72 |     }
73 |     const buf = Buffer.from(data.samples.buffer);
74 |     this.outStream.write(buf);
75 |     this.logger?.debug(
76 |       `[RecordToDiskPlugin] Wrote ${buf.byteLength} bytes from userId=${data.userId} to disk`,
77 |     );
78 |   }
79 | 
80 |   /**
81 |    * Called when the plugin is cleaned up (e.g. space/participant stop).
82 |    * We close our file stream.
83 |    */
84 |   cleanup(): void {
85 |     this.logger?.info('[RecordToDiskPlugin] cleanup => closing output stream');
86 |     if (this.outStream) {
87 |       this.outStream.end();
88 |       this.outStream = undefined;
89 |     }
90 |   }
91 | }
92 | 


--------------------------------------------------------------------------------
/src/spaces/test.ts:
--------------------------------------------------------------------------------
  1 | // src/test.ts
  2 | 
  3 | import 'dotenv/config';
  4 | import { Space, SpaceConfig } from './core/Space';
  5 | import { Scraper } from '../scraper';
  6 | import { RecordToDiskPlugin } from './plugins/RecordToDiskPlugin';
  7 | import { SttTtsPlugin } from './plugins/SttTtsPlugin';
  8 | import { IdleMonitorPlugin } from './plugins/IdleMonitorPlugin';
  9 | import { HlsRecordPlugin } from './plugins/HlsRecordPlugin';
 10 | 
 11 | /**
 12 |  * Main test entry point
 13 |  */
 14 | async function main() {
 15 |   console.log('[Test] Starting...');
 16 | 
 17 |   // 1) Twitter login with your scraper
 18 |   const scraper = new Scraper();
 19 |   await scraper.login(
 20 |     process.env.TWITTER_USERNAME!,
 21 |     process.env.TWITTER_PASSWORD!,
 22 |   );
 23 | 
 24 |   // 2) Create the Space instance
 25 |   // Set debug=true if you want more logs
 26 |   const space = new Space(scraper, { debug: false });
 27 | 
 28 |   // --------------------------------------------------------------------------------
 29 |   // EXAMPLE 1: Record raw speaker audio via RecordToDiskPlugin (local plugin approach)
 30 |   // --------------------------------------------------------------------------------
 31 |   const recordPlugin = new RecordToDiskPlugin();
 32 |   space.use(recordPlugin);
 33 | 
 34 |   // --------------------------------------------------------------------------------
 35 |   // EXAMPLE 2: HLSRecordPlugin => record final Space mix as .ts file via HLS
 36 |   // (Requires the "scraper" to fetch the HLS URL, and ffmpeg installed.)
 37 |   // --------------------------------------------------------------------------------
 38 |   const hlsPlugin = new HlsRecordPlugin();
 39 |   // If you want, you can override the default output path in pluginConfig, for example:
 40 |   // space.use(hlsPlugin, { outputPath: '/tmp/my_custom_space.ts' });
 41 |   space.use(hlsPlugin);
 42 | 
 43 |   // Create our TTS/STT plugin instance
 44 |   const sttTtsPlugin = new SttTtsPlugin();
 45 |   space.use(sttTtsPlugin, {
 46 |     openAiApiKey: process.env.OPENAI_API_KEY,
 47 |     elevenLabsApiKey: process.env.ELEVENLABS_API_KEY,
 48 |     voiceId: 'D38z5RcWu1voky8WS1ja', // example
 49 |     // You can also initialize systemPrompt, chatContext, etc. here if you wish
 50 |     // systemPrompt: "You are a calm and friendly AI assistant."
 51 |   });
 52 | 
 53 |   // Create an IdleMonitorPlugin to stop after 60s of silence
 54 |   const idlePlugin = new IdleMonitorPlugin(60_000, 10_000);
 55 |   space.use(idlePlugin);
 56 | 
 57 |   // If idle occurs, say goodbye and end the Space
 58 |   space.on('idleTimeout', async (info) => {
 59 |     console.log(`[Test] idleTimeout => no audio for ${info.idleMs}ms.`);
 60 |     await sttTtsPlugin.speakText('Ending Space due to inactivity. Goodbye!');
 61 |     await new Promise((r) => setTimeout(r, 10_000));
 62 |     await space.stop();
 63 |     console.log('[Test] Space stopped due to silence.');
 64 |     process.exit(0);
 65 |   });
 66 | 
 67 |   // 3) Initialize the Space
 68 |   const config: SpaceConfig = {
 69 |     mode: 'INTERACTIVE',
 70 |     title: 'AI Chat - Dynamic GPT Config',
 71 |     description: 'Space that demonstrates dynamic GPT personalities.',
 72 |     languages: ['en'],
 73 |   };
 74 | 
 75 |   const broadcastInfo = await space.initialize(config);
 76 |   const spaceUrl = broadcastInfo.share_url.replace('broadcasts', 'spaces');
 77 |   console.log('[Test] Space created =>', spaceUrl);
 78 | 
 79 |   // (Optional) Tweet out the Space link
 80 |   await scraper.sendTweet(`${config.title} ${spaceUrl}`);
 81 |   console.log('[Test] Tweet sent');
 82 | 
 83 |   // ---------------------------------------
 84 |   // Example of dynamic GPT usage:
 85 |   // You can change the system prompt at runtime
 86 |   setTimeout(() => {
 87 |     console.log('[Test] Changing system prompt to a new persona...');
 88 |     sttTtsPlugin.setSystemPrompt(
 89 |       'You are a very sarcastic AI who uses short answers.',
 90 |     );
 91 |   }, 45_000);
 92 | 
 93 |   // Another example: after some time, switch to GPT-4
 94 |   setTimeout(() => {
 95 |     console.log('[Test] Switching GPT model to "gpt-4" (if available)...');
 96 |     sttTtsPlugin.setGptModel('gpt-4');
 97 |   }, 60_000);
 98 | 
 99 |   // Also, demonstrate how to manually call askChatGPT and speak the result
100 |   setTimeout(async () => {
101 |     console.log('[Test] Asking GPT for an introduction...');
102 |     try {
103 |       const response = await sttTtsPlugin['askChatGPT']('Introduce yourself');
104 |       console.log('[Test] ChatGPT introduction =>', response);
105 | 
106 |       // Then speak it
107 |       await sttTtsPlugin.speakText(response);
108 |     } catch (err) {
109 |       console.error('[Test] askChatGPT error =>', err);
110 |     }
111 |   }, 75_000);
112 | 
113 |   // Example: periodically speak a greeting every 60s
114 |   setInterval(() => {
115 |     sttTtsPlugin
116 |       .speakText('Hello everyone, this is an automated greeting.')
117 |       .catch((err) => console.error('[Test] speakText() =>', err));
118 |   }, 20_000);
119 | 
120 |   // 4) Some event listeners
121 |   space.on('speakerRequest', async (req) => {
122 |     console.log('[Test] Speaker request =>', req);
123 |     await space.approveSpeaker(req.userId, req.sessionUUID);
124 | 
125 |     // Remove the speaker after 60 seconds (testing only)
126 |     setTimeout(() => {
127 |       console.log(
128 |         `[Test] Removing speaker => userId=${req.userId} (after 60s)`,
129 |       );
130 |       space.removeSpeaker(req.userId).catch((err) => {
131 |         console.error('[Test] removeSpeaker error =>', err);
132 |       });
133 |     }, 60_000);
134 |   });
135 | 
136 |   // When a user reacts, send back an emoji to test the flow
137 |   space.on('guestReaction', (evt) => {
138 |     // Pick a random emoji from the list
139 |     const emojis = ['💯', '✨', '🙏', '🎮'];
140 |     const emoji = emojis[Math.floor(Math.random() * emojis.length)];
141 |     space.reactWithEmoji(emoji);
142 |   });
143 | 
144 |   space.on('error', (err) => {
145 |     console.error('[Test] Space Error =>', err);
146 |   });
147 | 
148 |   // ==================================================
149 |   // BEEP GENERATION (500 ms) @16kHz => 8000 samples
150 |   // ==================================================
151 |   const beepDurationMs = 500;
152 |   const sampleRate = 16000;
153 |   const totalSamples = (sampleRate * beepDurationMs) / 1000; // 8000
154 |   const beepFull = new Int16Array(totalSamples);
155 | 
156 |   // Sine wave: 440Hz, amplitude ~12000
157 |   const freq = 440;
158 |   const amplitude = 12000;
159 |   for (let i = 0; i < beepFull.length; i++) {
160 |     const t = i / sampleRate;
161 |     beepFull[i] = amplitude * Math.sin(2 * Math.PI * freq * t);
162 |   }
163 | 
164 |   const FRAME_SIZE = 160;
165 |   /**
166 |    * Send a beep by slicing beepFull into frames of 160 samples
167 |    */
168 |   async function sendBeep() {
169 |     console.log('[Test] Starting beep...');
170 |     for (let offset = 0; offset < beepFull.length; offset += FRAME_SIZE) {
171 |       const portion = beepFull.subarray(offset, offset + FRAME_SIZE);
172 |       const frame = new Int16Array(FRAME_SIZE);
173 |       frame.set(portion);
174 |       space.pushAudio(frame, sampleRate);
175 |       await new Promise((r) => setTimeout(r, 10));
176 |     }
177 |     console.log('[Test] Finished beep');
178 |   }
179 | 
180 |   // Example: Send beep every 5s (currently commented out)
181 |   // setInterval(() => {
182 |   //   sendBeep().catch((err) => console.error('[Test] beep error =>', err));
183 |   // }, 5000);
184 | 
185 |   console.log('[Test] Space is running... press Ctrl+C to exit.');
186 | 
187 |   // Graceful shutdown
188 |   process.on('SIGINT', async () => {
189 |     console.log('\n[Test] Caught interrupt signal, stopping...');
190 |     await space.stop();
191 |     console.log('[Test] Space stopped. Bye!');
192 |     process.exit(0);
193 |   });
194 | }
195 | 
196 | main().catch((err) => {
197 |   console.error('[Test] Unhandled main error =>', err);
198 |   process.exit(1);
199 | });
200 | 


--------------------------------------------------------------------------------
/src/spaces/testParticipant.ts:
--------------------------------------------------------------------------------
  1 | // src/testParticipant.ts
  2 | 
  3 | import 'dotenv/config';
  4 | import { Scraper } from '../scraper';
  5 | import { SpaceParticipant } from './core/SpaceParticipant';
  6 | import { SttTtsPlugin } from './plugins/SttTtsPlugin';
  7 | 
  8 | /**
  9 |  * Main test entry point for the "participant" flow:
 10 |  * - Joins an existing Space in listener mode
 11 |  * - Requests speaker role
 12 |  * - Waits for host approval (with a timeout)
 13 |  * - Optionally sends periodic beep frames if we become speaker
 14 |  * - Adds a graceful SIGINT handler for cleanup
 15 |  */
 16 | async function main() {
 17 |   console.log('[TestParticipant] Starting...');
 18 | 
 19 |   // 1) Twitter login via Scraper
 20 |   const scraper = new Scraper();
 21 |   await scraper.login(
 22 |     process.env.TWITTER_USERNAME!,
 23 |     process.env.TWITTER_PASSWORD!,
 24 |   );
 25 | 
 26 |   // 2) Create the participant
 27 |   // Replace with your target AudioSpace ID
 28 |   const audioSpaceId = '1eaKbaNYanvxX';
 29 |   const participant = new SpaceParticipant(scraper, {
 30 |     spaceId: audioSpaceId,
 31 |     debug: false,
 32 |   });
 33 | 
 34 |   // Create our TTS/STT plugin instance, just for demonstration
 35 |   const sttTtsPlugin = new SttTtsPlugin();
 36 |   participant.use(sttTtsPlugin, {
 37 |     openAiApiKey: process.env.OPENAI_API_KEY,
 38 |     elevenLabsApiKey: process.env.ELEVENLABS_API_KEY,
 39 |     voiceId: 'D38z5RcWu1voky8WS1ja', // example voice
 40 |     // systemPrompt: "You are a calm and friendly AI assistant."
 41 |   });
 42 | 
 43 |   // 3) Join the Space in listener mode
 44 |   await participant.joinAsListener();
 45 |   console.log('[TestParticipant] HLS URL =>', participant.getHlsUrl());
 46 | 
 47 |   // 4) Request the speaker role => returns { sessionUUID }
 48 |   const { sessionUUID } = await participant.requestSpeaker();
 49 |   console.log('[TestParticipant] Requested speaker =>', sessionUUID);
 50 | 
 51 |   // 5) Wait for host acceptance with a maximum wait time (e.g., 15 seconds).
 52 |   try {
 53 |     await waitForApproval(participant, sessionUUID, 15000);
 54 |     console.log(
 55 |       '[TestParticipant] Speaker approval sequence completed (ok or timed out).',
 56 |     );
 57 |   } catch (err) {
 58 |     console.error('[TestParticipant] Approval error or timeout =>', err);
 59 |     // Optionally cancel the request if we timed out or got an error
 60 |     try {
 61 |       await participant.cancelSpeakerRequest();
 62 |       console.log(
 63 |         '[TestParticipant] Speaker request canceled after timeout or error.',
 64 |       );
 65 |     } catch (cancelErr) {
 66 |       console.error(
 67 |         '[TestParticipant] Could not cancel the request =>',
 68 |         cancelErr,
 69 |       );
 70 |     }
 71 |   }
 72 | 
 73 |   // (Optional) Mute/unmute test
 74 |   await participant.muteSelf();
 75 |   console.log('[TestParticipant] Muted.');
 76 |   await new Promise((resolve) => setTimeout(resolve, 3000));
 77 |   await participant.unmuteSelf();
 78 |   console.log('[TestParticipant] Unmuted.');
 79 | 
 80 |   // ---------------------------------------------------------
 81 |   // Example beep generation (sends PCM frames if we're speaker)
 82 |   // ---------------------------------------------------------
 83 |   const beepDurationMs = 500;
 84 |   const sampleRate = 16000;
 85 |   const totalSamples = (sampleRate * beepDurationMs) / 1000; // 8000
 86 |   const beepFull = new Int16Array(totalSamples);
 87 | 
 88 |   // Sine wave at 440Hz, amplitude ~12000
 89 |   const freq = 440;
 90 |   const amplitude = 12000;
 91 |   for (let i = 0; i < beepFull.length; i++) {
 92 |     const t = i / sampleRate;
 93 |     beepFull[i] = amplitude * Math.sin(2 * Math.PI * freq * t);
 94 |   }
 95 | 
 96 |   const FRAME_SIZE = 160;
 97 |   async function sendBeep() {
 98 |     console.log('[TestParticipant] Starting beep...');
 99 |     for (let offset = 0; offset < beepFull.length; offset += FRAME_SIZE) {
100 |       const portion = beepFull.subarray(offset, offset + FRAME_SIZE);
101 |       const frame = new Int16Array(FRAME_SIZE);
102 |       frame.set(portion);
103 |       participant.pushAudio(frame, sampleRate);
104 |       await new Promise((r) => setTimeout(r, 10));
105 |     }
106 |     console.log('[TestParticipant] Finished beep.');
107 |   }
108 | 
109 |   // Example: send beep every 10s
110 |   const beepInterval = setInterval(() => {
111 |     sendBeep().catch((err) =>
112 |       console.error('[TestParticipant] beep error =>', err),
113 |     );
114 |   }, 10000);
115 | 
116 |   // Graceful shutdown after 60s
117 |   const shutdownTimer = setTimeout(async () => {
118 |     await participant.leaveSpace();
119 |     console.log('[TestParticipant] Left space. Bye!');
120 |     process.exit(0);
121 |   }, 60000);
122 | 
123 |   // Catch SIGINT for manual stop
124 |   process.on('SIGINT', async () => {
125 |     console.log('\n[TestParticipant] Caught interrupt signal, stopping...');
126 |     clearInterval(beepInterval);
127 |     clearTimeout(shutdownTimer);
128 |     await participant.leaveSpace();
129 |     console.log('[TestParticipant] Space left. Bye!');
130 |     process.exit(0);
131 |   });
132 | }
133 | 
134 | /**
135 |  * waitForApproval waits until "newSpeakerAccepted" matches our sessionUUID,
136 |  * then calls becomeSpeaker() or rejects after a given timeout.
137 |  */
138 | function waitForApproval(
139 |   participant: SpaceParticipant,
140 |   sessionUUID: string,
141 |   timeoutMs = 10000,
142 | ): Promise<void> {
143 |   return new Promise<void>((resolve, reject) => {
144 |     let resolved = false;
145 | 
146 |     const handler = async (evt: { sessionUUID: string }) => {
147 |       if (evt.sessionUUID === sessionUUID) {
148 |         resolved = true;
149 |         participant.off('newSpeakerAccepted', handler);
150 |         try {
151 |           await participant.becomeSpeaker();
152 |           console.log('[TestParticipant] Successfully became speaker!');
153 |           resolve();
154 |         } catch (err) {
155 |           reject(err);
156 |         }
157 |       }
158 |     };
159 | 
160 |     // Listen to "newSpeakerAccepted" from participant
161 |     participant.on('newSpeakerAccepted', handler);
162 | 
163 |     // Timeout to reject if not approved in time
164 |     setTimeout(() => {
165 |       if (!resolved) {
166 |         participant.off('newSpeakerAccepted', handler);
167 |         reject(
168 |           new Error(
169 |             `[TestParticipant] Timed out waiting for speaker approval after ${timeoutMs}ms.`,
170 |           ),
171 |         );
172 |       }
173 |     }, timeoutMs);
174 |   });
175 | }
176 | 
177 | main().catch((err) => {
178 |   console.error('[TestParticipant] Unhandled error =>', err);
179 |   process.exit(1);
180 | });
181 | 


--------------------------------------------------------------------------------
/src/spaces/types.ts:
--------------------------------------------------------------------------------
  1 | // src/types.ts
  2 | 
  3 | import { Space } from './core/Space';
  4 | import { SpaceParticipant } from './core/SpaceParticipant';
  5 | 
  6 | /**
  7 |  * Basic PCM audio frame properties.
  8 |  */
  9 | export interface AudioData {
 10 |   /**
 11 |    * Bits per sample (e.g., 16).
 12 |    */
 13 |   bitsPerSample: number;
 14 | 
 15 |   /**
 16 |    * The sample rate in Hz (e.g., 48000 for 48kHz).
 17 |    */
 18 |   sampleRate: number;
 19 | 
 20 |   /**
 21 |    * Number of channels (e.g., 1 for mono, 2 for stereo).
 22 |    */
 23 |   channelCount: number;
 24 | 
 25 |   /**
 26 |    * Number of frames (samples per channel).
 27 |    */
 28 |   numberOfFrames: number;
 29 | 
 30 |   /**
 31 |    * The raw PCM data for all channels (interleaved if stereo).
 32 |    */
 33 |   samples: Int16Array;
 34 | }
 35 | 
 36 | /**
 37 |  * PCM audio data with an associated user ID, indicating which speaker produced it.
 38 |  */
 39 | export interface AudioDataWithUser extends AudioData {
 40 |   /**
 41 |    * The ID of the speaker or user who produced this audio frame.
 42 |    */
 43 |   userId: string;
 44 | }
 45 | 
 46 | /**
 47 |  * Information about a speaker request event in a Space.
 48 |  */
 49 | export interface SpeakerRequest {
 50 |   userId: string;
 51 |   username: string;
 52 |   displayName: string;
 53 |   sessionUUID: string;
 54 | }
 55 | 
 56 | /**
 57 |  * Occupancy update describing the number of participants in a Space.
 58 |  */
 59 | export interface OccupancyUpdate {
 60 |   occupancy: number;
 61 |   totalParticipants: number;
 62 | }
 63 | 
 64 | /**
 65 |  * Represents an emoji reaction event by a user in the chat.
 66 |  */
 67 | export interface GuestReaction {
 68 |   displayName: string;
 69 |   emoji: string;
 70 | }
 71 | 
 72 | /**
 73 |  * Response structure after creating a broadcast on Periscope/Twitter.
 74 |  */
 75 | export interface BroadcastCreated {
 76 |   room_id: string;
 77 |   credential: string;
 78 |   stream_name: string;
 79 |   webrtc_gw_url: string;
 80 |   broadcast: {
 81 |     user_id: string;
 82 |     twitter_id: string;
 83 |     media_key: string;
 84 |   };
 85 |   access_token: string;
 86 |   endpoint: string;
 87 |   share_url: string;
 88 |   stream_url: string;
 89 | }
 90 | 
 91 | /**
 92 |  * Describes TURN server credentials and URIs.
 93 |  */
 94 | export interface TurnServersInfo {
 95 |   ttl: string;
 96 |   username: string;
 97 |   password: string;
 98 |   uris: string[];
 99 | }
100 | 
101 | /**
102 |  * Defines a plugin interface for both Space (broadcast host) and SpaceParticipant (listener/speaker).
103 |  *
104 |  * Lifecycle hooks:
105 |  *  - onAttach(...) is called immediately after .use(plugin).
106 |  *  - init(...) is called after the space or participant has joined in basic mode (listener + chat).
107 |  *  - onJanusReady(...) is called if/when a JanusClient is created (i.e., speaker mode).
108 |  *  - onAudioData(...) is called upon receiving raw PCM frames from a speaker.
109 |  *  - cleanup(...) is called when the space/participant stops or the plugin is removed.
110 |  */
111 | export interface Plugin {
112 |   /**
113 |    * Called immediately when the plugin is added via .use(plugin).
114 |    * Usually used for initial references or minimal setup.
115 |    */
116 |   onAttach?(params: {
117 |     space: Space | SpaceParticipant;
118 |     pluginConfig?: Record<string, any>;
119 |   }): void;
120 | 
121 |   /**
122 |    * Called once the space/participant has fully initialized basic features (chat, HLS, etc.).
123 |    * This is the ideal place to finalize setup for plugins that do not require Janus/speaker mode.
124 |    */
125 |   init?(params: {
126 |     space: Space | SpaceParticipant;
127 |     pluginConfig?: Record<string, any>;
128 |   }): void;
129 | 
130 |   /**
131 |    * Called if/when a JanusClient becomes available (e.g., user becomes a speaker).
132 |    * Plugins that need direct Janus interactions can implement logic here.
133 |    */
134 |   onJanusReady?(janusClient: any): void;
135 | 
136 |   /**
137 |    * Called whenever raw PCM audio frames arrive from a speaker.
138 |    * Useful for speech-to-text, analytics, or logging.
139 |    */
140 |   onAudioData?(data: AudioDataWithUser): void;
141 | 
142 |   /**
143 |    * Cleanup lifecycle hook, invoked when the plugin is removed or the space/participant stops.
144 |    * Allows releasing resources, stopping timers, or closing file handles.
145 |    */
146 |   cleanup?(): void;
147 | }
148 | 
149 | /**
150 |  * Internal registration structure for a plugin, used to store the plugin instance + config.
151 |  */
152 | export interface PluginRegistration {
153 |   plugin: Plugin;
154 |   config?: Record<string, any>;
155 | }
156 | 
157 | /**
158 |  * Stores information about a speaker in a Space (host perspective).
159 |  */
160 | export interface SpeakerInfo {
161 |   userId: string;
162 |   sessionUUID: string;
163 |   janusParticipantId?: number;
164 | }
165 | 


--------------------------------------------------------------------------------
/src/test-utils.ts:
--------------------------------------------------------------------------------
  1 | import { ProxyAgent,setGlobalDispatcher } from 'undici';
  2 | import { Scraper } from './scraper';
  3 | import fs from 'fs';
  4 | 
  5 | export interface ScraperTestOptions {
  6 |   /**
  7 |    * Authentication method preference for the scraper.
  8 |    * - 'api': Use Twitter API keys and tokens.
  9 |    * - 'cookies': Resume session using cookies.
 10 |    * - 'password': Use username/password for login.
 11 |    * - 'anonymous': No authentication.
 12 |    */
 13 |   authMethod: 'api' | 'cookies' | 'password' | 'anonymous';
 14 | }
 15 | 
 16 | export async function getScraper(
 17 |   options: Partial<ScraperTestOptions> = { authMethod: 'cookies' },
 18 | ) {
 19 |   const username = process.env['TWITTER_USERNAME'];
 20 |   const password = process.env['TWITTER_PASSWORD'];
 21 |   const email = process.env['TWITTER_EMAIL'];
 22 |   const twoFactorSecret = process.env['TWITTER_2FA_SECRET'];
 23 | 
 24 |   const apiKey = process.env['TWITTER_API_KEY'];
 25 |   const apiSecretKey = process.env['TWITTER_API_SECRET_KEY'];
 26 |   const accessToken = process.env['TWITTER_ACCESS_TOKEN'];
 27 |   const accessTokenSecret = process.env['TWITTER_ACCESS_TOKEN_SECRET'];
 28 | 
 29 |   let cookiesArray: any = null;
 30 | 
 31 |   // try to read cookies by reading cookies.json with fs and parsing
 32 |   // check if cookies.json exists
 33 |   if (!fs.existsSync('./cookies.json')) {
 34 |     console.error(
 35 |       'cookies.json not found, using password auth - this is NOT recommended!',
 36 |     );
 37 |   } else {
 38 |     try {
 39 |       const cookiesText = fs.readFileSync('./cookies.json', 'utf8');
 40 |       cookiesArray = JSON.parse(cookiesText);
 41 |     } catch (e) {
 42 |       console.error('Error parsing cookies.json', e);
 43 |     }
 44 |   }
 45 | 
 46 |   const cookieStrings = cookiesArray?.map(
 47 |     (cookie: any) =>
 48 |       `${cookie.key}=${cookie.value}; Domain=${cookie.domain}; Path=${
 49 |         cookie.path
 50 |       }; ${cookie.secure ? 'Secure' : ''}; ${
 51 |         cookie.httpOnly ? 'HttpOnly' : ''
 52 |       }; SameSite=${cookie.sameSite || 'Lax'}`,
 53 |   );
 54 | 
 55 |   const proxyUrl = process.env['PROXY_URL'];
 56 |   let agent: any;
 57 | 
 58 |   if (
 59 |     options.authMethod === 'cookies' &&
 60 |     (!cookieStrings || cookieStrings.length === 0)
 61 |   ) {
 62 |     console.warn(
 63 |       'TWITTER_COOKIES variable is not defined, reverting to password auth (not recommended)',
 64 |     );
 65 |     options.authMethod = 'password';
 66 |   }
 67 | 
 68 |   if (options.authMethod === 'password' && !(username && password)) {
 69 |     throw new Error(
 70 |       'TWITTER_USERNAME and TWITTER_PASSWORD variables must be defined.',
 71 |     );
 72 |   }
 73 | 
 74 |   if (proxyUrl) {
 75 |     // Parse the proxy URL
 76 |     const url = new URL(proxyUrl);
 77 |     const username = url.username;
 78 |     const password = url.password;
 79 | 
 80 |     // Strip auth from URL if present
 81 |     url.username = '';
 82 |     url.password = '';
 83 | 
 84 |     const agentOptions: any = {
 85 |       uri: url.toString(),
 86 |       requestTls: {
 87 |         rejectUnauthorized: false,
 88 |       },
 89 |     };
 90 | 
 91 |     // Add Basic auth if credentials exist
 92 |     if (username && password) {
 93 |       agentOptions.token = `Basic ${Buffer.from(
 94 |         `${username}:${password}`,
 95 |       ).toString('base64')}`;
 96 |     }
 97 | 
 98 |     agent = new ProxyAgent(agentOptions);
 99 | 
100 |     setGlobalDispatcher(agent)
101 |   }
102 | 
103 |   const scraper = new Scraper({
104 |     transform: {
105 |       request: (input, init) => {
106 |         if (agent) {
107 |           return [input, { ...init, dispatcher: agent }];
108 |         }
109 |         return [input, init];
110 |       },
111 |     },
112 |   });
113 | 
114 |   if (
115 |     options.authMethod === 'api' &&
116 |     username &&
117 |     password &&
118 |     apiKey &&
119 |     apiSecretKey &&
120 |     accessToken &&
121 |     accessTokenSecret
122 |   ) {
123 |     await scraper.login(
124 |       username,
125 |       password,
126 |       email,
127 |       twoFactorSecret,
128 |       apiKey,
129 |       apiSecretKey,
130 |       accessToken,
131 |       accessTokenSecret,
132 |     );
133 |   } else if (options.authMethod === 'cookies' && cookieStrings?.length) {
134 |     await scraper.setCookies(cookieStrings);
135 |   } else if (options.authMethod === 'password' && username && password) {
136 |     await scraper.login(username, password, email, twoFactorSecret);
137 |   } else {
138 |     console.warn(
139 |       'No valid authentication method available. Ensure at least one of the following is configured: API credentials, cookies, or username/password.',
140 |     );
141 |   }
142 | 
143 |   return scraper;
144 | }
145 | 


--------------------------------------------------------------------------------
/src/timeline-async.ts:
--------------------------------------------------------------------------------
 1 | import { Profile } from './profile';
 2 | import { Tweet } from './tweets';
 3 | 
 4 | export interface FetchProfilesResponse {
 5 |   profiles: Profile[];
 6 |   next?: string;
 7 | }
 8 | 
 9 | export type FetchProfiles = (
10 |   query: string,
11 |   maxProfiles: number,
12 |   cursor: string | undefined,
13 | ) => Promise<FetchProfilesResponse>;
14 | 
15 | export interface FetchTweetsResponse {
16 |   tweets: Tweet[];
17 |   next?: string;
18 | }
19 | 
20 | export type FetchTweets = (
21 |   query: string,
22 |   maxTweets: number,
23 |   cursor: string | undefined,
24 | ) => Promise<FetchTweetsResponse>;
25 | 
26 | export async function* getUserTimeline(
27 |   query: string,
28 |   maxProfiles: number,
29 |   fetchFunc: FetchProfiles,
30 | ): AsyncGenerator<Profile, void> {
31 |   let nProfiles = 0;
32 |   let cursor: string | undefined = undefined;
33 |   let consecutiveEmptyBatches = 0;
34 |   while (nProfiles < maxProfiles) {
35 |     const batch: FetchProfilesResponse = await fetchFunc(
36 |       query,
37 |       maxProfiles,
38 |       cursor,
39 |     );
40 | 
41 |     const { profiles, next } = batch;
42 |     cursor = next;
43 | 
44 |     if (profiles.length === 0) {
45 |       consecutiveEmptyBatches++;
46 |       if (consecutiveEmptyBatches > 5) break;
47 |     } else consecutiveEmptyBatches = 0;
48 | 
49 |     for (const profile of profiles) {
50 |       if (nProfiles < maxProfiles) yield profile;
51 |       else break;
52 |       nProfiles++;
53 |     }
54 | 
55 |     if (!next) break;
56 |   }
57 | }
58 | 
59 | export async function* getTweetTimeline(
60 |   query: string,
61 |   maxTweets: number,
62 |   fetchFunc: FetchTweets,
63 | ): AsyncGenerator<Tweet, void> {
64 |   let nTweets = 0;
65 |   let cursor: string | undefined = undefined;
66 |   while (nTweets < maxTweets) {
67 |     const batch: FetchTweetsResponse = await fetchFunc(
68 |       query,
69 |       maxTweets,
70 |       cursor,
71 |     );
72 | 
73 |     const { tweets, next } = batch;
74 | 
75 |     if (tweets.length === 0) {
76 |       break;
77 |     }
78 | 
79 |     for (const tweet of tweets) {
80 |       if (nTweets < maxTweets) {
81 |         cursor = next;
82 |         yield tweet;
83 |       } else {
84 |         break;
85 |       }
86 | 
87 |       nTweets++;
88 |     }
89 |   }
90 | }
91 | 


--------------------------------------------------------------------------------
/src/timeline-following.ts:
--------------------------------------------------------------------------------
 1 | import { requestApi } from './api';
 2 | import { TwitterAuth } from './auth';
 3 | import { ApiError } from './errors';
 4 | import { TimelineInstruction } from './timeline-v2';
 5 | 
 6 | export interface HomeLatestTimelineResponse {
 7 |   data?: {
 8 |     home: {
 9 |       home_timeline_urt: {
10 |         instructions: TimelineInstruction[];
11 |       };
12 |     };
13 |   };
14 | }
15 | 
16 | export async function fetchFollowingTimeline(
17 |   count: number,
18 |   seenTweetIds: string[],
19 |   auth: TwitterAuth,
20 | ): Promise<any[]> {
21 |   const variables = {
22 |     count,
23 |     includePromotedContent: true,
24 |     latestControlAvailable: true,
25 |     requestContext: 'launch',
26 |     seenTweetIds,
27 |   };
28 | 
29 |   const features = {
30 |     profile_label_improvements_pcf_label_in_post_enabled: true,
31 |     rweb_tipjar_consumption_enabled: true,
32 |     responsive_web_graphql_exclude_directive_enabled: true,
33 |     verified_phone_label_enabled: false,
34 |     creator_subscriptions_tweet_preview_api_enabled: true,
35 |     responsive_web_graphql_timeline_navigation_enabled: true,
36 |     responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
37 |     communities_web_enable_tweet_community_results_fetch: true,
38 |     c9s_tweet_anatomy_moderator_badge_enabled: true,
39 |     articles_preview_enabled: true,
40 |     responsive_web_edit_tweet_api_enabled: true,
41 |     graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
42 |     view_counts_everywhere_api_enabled: true,
43 |     longform_notetweets_consumption_enabled: true,
44 |     responsive_web_twitter_article_tweet_consumption_enabled: true,
45 |     tweet_awards_web_tipping_enabled: false,
46 |     creator_subscriptions_quote_tweet_preview_enabled: false,
47 |     freedom_of_speech_not_reach_fetch_enabled: true,
48 |     standardized_nudges_misinfo: true,
49 |     tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled:
50 |       true,
51 |     rweb_video_timestamps_enabled: true,
52 |     longform_notetweets_rich_text_read_enabled: true,
53 |     longform_notetweets_inline_media_enabled: true,
54 |     responsive_web_enhance_cards_enabled: false,
55 |   };
56 | 
57 |   const res = await requestApi<HomeLatestTimelineResponse>(
58 |     `https://x.com/i/api/graphql/K0X1xbCZUjttdK8RazKAlw/HomeLatestTimeline?variables=${encodeURIComponent(
59 |       JSON.stringify(variables),
60 |     )}&features=${encodeURIComponent(JSON.stringify(features))}`,
61 |     auth,
62 |     'GET',
63 |   );
64 | 
65 |   if (!res.success) {
66 |     if (res.err instanceof ApiError) {
67 |       console.error('Error details:', res.err.data);
68 |     }
69 |     throw res.err;
70 |   }
71 | 
72 |   const home = res.value?.data?.home.home_timeline_urt?.instructions;
73 | 
74 |   if (!home) {
75 |     return [];
76 |   }
77 | 
78 |   const entries: any[] = [];
79 | 
80 |   for (const instruction of home) {
81 |     if (instruction.type === 'TimelineAddEntries') {
82 |       for (const entry of instruction.entries ?? []) {
83 |         entries.push(entry);
84 |       }
85 |     }
86 |   }
87 |   // get the itemContnent from each entry
88 |   const tweets = entries
89 |     .map((entry) => entry.content.itemContent?.tweet_results?.result)
90 |     .filter((tweet) => tweet !== undefined);
91 | 
92 |   return tweets;
93 | }
94 | 


--------------------------------------------------------------------------------
/src/timeline-home.ts:
--------------------------------------------------------------------------------
 1 | import { requestApi } from './api';
 2 | import { TwitterAuth } from './auth';
 3 | import { ApiError } from './errors';
 4 | import { TimelineInstruction } from './timeline-v2';
 5 | 
 6 | export interface HomeTimelineResponse {
 7 |   data?: {
 8 |     home: {
 9 |       home_timeline_urt: {
10 |         instructions: TimelineInstruction[];
11 |       };
12 |     };
13 |   };
14 | }
15 | 
16 | export async function fetchHomeTimeline(
17 |   count: number,
18 |   seenTweetIds: string[],
19 |   auth: TwitterAuth,
20 | ): Promise<any[]> {
21 |   const variables = {
22 |     count,
23 |     includePromotedContent: true,
24 |     latestControlAvailable: true,
25 |     requestContext: 'launch',
26 |     withCommunity: true,
27 |     seenTweetIds,
28 |   };
29 | 
30 |   const features = {
31 |     rweb_tipjar_consumption_enabled: true,
32 |     responsive_web_graphql_exclude_directive_enabled: true,
33 |     verified_phone_label_enabled: false,
34 |     creator_subscriptions_tweet_preview_api_enabled: true,
35 |     responsive_web_graphql_timeline_navigation_enabled: true,
36 |     responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
37 |     communities_web_enable_tweet_community_results_fetch: true,
38 |     c9s_tweet_anatomy_moderator_badge_enabled: true,
39 |     articles_preview_enabled: true,
40 |     responsive_web_edit_tweet_api_enabled: true,
41 |     graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
42 |     view_counts_everywhere_api_enabled: true,
43 |     longform_notetweets_consumption_enabled: true,
44 |     responsive_web_twitter_article_tweet_consumption_enabled: true,
45 |     tweet_awards_web_tipping_enabled: false,
46 |     creator_subscriptions_quote_tweet_preview_enabled: false,
47 |     freedom_of_speech_not_reach_fetch_enabled: true,
48 |     standardized_nudges_misinfo: true,
49 |     tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled:
50 |       true,
51 |     rweb_video_timestamps_enabled: true,
52 |     longform_notetweets_rich_text_read_enabled: true,
53 |     longform_notetweets_inline_media_enabled: true,
54 |     responsive_web_enhance_cards_enabled: false,
55 |   };
56 | 
57 |   const res = await requestApi<HomeTimelineResponse>(
58 |     `https://x.com/i/api/graphql/HJFjzBgCs16TqxewQOeLNg/HomeTimeline?variables=${encodeURIComponent(
59 |       JSON.stringify(variables),
60 |     )}&features=${encodeURIComponent(JSON.stringify(features))}`,
61 |     auth,
62 |     'GET',
63 |   );
64 | 
65 |   if (!res.success) {
66 |     if (res.err instanceof ApiError) {
67 |       console.error('Error details:', res.err.data);
68 |     }
69 |     throw res.err;
70 |   }
71 | 
72 |   const home = res.value?.data?.home.home_timeline_urt?.instructions;
73 | 
74 |   if (!home) {
75 |     return [];
76 |   }
77 | 
78 |   const entries: any[] = [];
79 | 
80 |   for (const instruction of home) {
81 |     if (instruction.type === 'TimelineAddEntries') {
82 |       for (const entry of instruction.entries ?? []) {
83 |         entries.push(entry);
84 |       }
85 |     }
86 |   }
87 |   // get the itemContnent from each entry
88 |   const tweets = entries
89 |     .map((entry) => entry.content.itemContent?.tweet_results?.result)
90 |     .filter((tweet) => tweet !== undefined);
91 | 
92 |   return tweets;
93 | }
94 | 


--------------------------------------------------------------------------------
/src/timeline-list.ts:
--------------------------------------------------------------------------------
 1 | import { QueryTweetsResponse } from './timeline-v1';
 2 | import { parseAndPush, TimelineEntryRaw } from './timeline-v2';
 3 | import { Tweet } from './tweets';
 4 | 
 5 | export interface ListTimeline {
 6 |   data?: {
 7 |     list?: {
 8 |       tweets_timeline?: {
 9 |         timeline?: {
10 |           instructions?: {
11 |             entries?: TimelineEntryRaw[];
12 |             entry?: TimelineEntryRaw;
13 |             type?: string;
14 |           }[];
15 |         };
16 |       };
17 |     };
18 |   };
19 | }
20 | 
21 | export function parseListTimelineTweets(
22 |   timeline: ListTimeline,
23 | ): QueryTweetsResponse {
24 |   let bottomCursor: string | undefined;
25 |   let topCursor: string | undefined;
26 |   const tweets: Tweet[] = [];
27 |   const instructions =
28 |     timeline.data?.list?.tweets_timeline?.timeline?.instructions ?? [];
29 |   for (const instruction of instructions) {
30 |     const entries = instruction.entries ?? [];
31 | 
32 |     for (const entry of entries) {
33 |       const entryContent = entry.content;
34 |       if (!entryContent) continue;
35 | 
36 |       if (entryContent.cursorType === 'Bottom') {
37 |         bottomCursor = entryContent.value;
38 |         continue;
39 |       } else if (entryContent.cursorType === 'Top') {
40 |         topCursor = entryContent.value;
41 |         continue;
42 |       }
43 | 
44 |       const idStr = entry.entryId;
45 |       if (
46 |         !idStr.startsWith('tweet') &&
47 |         !idStr.startsWith('list-conversation')
48 |       ) {
49 |         continue;
50 |       }
51 | 
52 |       if (entryContent.itemContent) {
53 |         parseAndPush(tweets, entryContent.itemContent, idStr);
54 |       } else if (entryContent.items) {
55 |         for (const contentItem of entryContent.items) {
56 |           if (
57 |             contentItem.item &&
58 |             contentItem.item.itemContent &&
59 |             contentItem.entryId
60 |           ) {
61 |             parseAndPush(
62 |               tweets,
63 |               contentItem.item.itemContent,
64 |               contentItem.entryId.split('tweet-')[1],
65 |             );
66 |           }
67 |         }
68 |       }
69 |     }
70 |   }
71 | 
72 |   return { tweets, next: bottomCursor, previous: topCursor };
73 | }
74 | 


--------------------------------------------------------------------------------
/src/timeline-relationship.ts:
--------------------------------------------------------------------------------
 1 | import { Profile, parseProfile } from './profile';
 2 | import { QueryProfilesResponse } from './timeline-v1';
 3 | import { TimelineUserResultRaw } from './timeline-v2';
 4 | 
 5 | export interface RelationshipEntryItemContentRaw {
 6 |   itemType?: string;
 7 |   userDisplayType?: string;
 8 |   user_results?: {
 9 |     result?: TimelineUserResultRaw;
10 |   };
11 | }
12 | 
13 | export interface RelationshipEntryRaw {
14 |   entryId: string;
15 |   sortIndex: string;
16 |   content?: {
17 |     cursorType?: string;
18 |     entryType?: string;
19 |     __typename?: string;
20 |     value?: string;
21 |     itemContent?: RelationshipEntryItemContentRaw;
22 |   };
23 | }
24 | 
25 | export interface RelationshipTimeline {
26 |   data?: {
27 |     user?: {
28 |       result?: {
29 |         timeline?: {
30 |           timeline?: {
31 |             instructions?: {
32 |               entries?: RelationshipEntryRaw[];
33 |               entry?: RelationshipEntryRaw;
34 |               type?: string;
35 |             }[];
36 |           };
37 |         };
38 |       };
39 |     };
40 |   };
41 | }
42 | 
43 | export function parseRelationshipTimeline(
44 |   timeline: RelationshipTimeline,
45 | ): QueryProfilesResponse {
46 |   let bottomCursor: string | undefined;
47 |   let topCursor: string | undefined;
48 |   const profiles: Profile[] = [];
49 |   const instructions =
50 |     timeline.data?.user?.result?.timeline?.timeline?.instructions ?? [];
51 | 
52 |   for (const instruction of instructions) {
53 |     if (
54 |       instruction.type === 'TimelineAddEntries' ||
55 |       instruction.type === 'TimelineReplaceEntry'
56 |     ) {
57 |       if (instruction.entry?.content?.cursorType === 'Bottom') {
58 |         bottomCursor = instruction.entry.content.value;
59 |         continue;
60 |       }
61 | 
62 |       if (instruction.entry?.content?.cursorType === 'Top') {
63 |         topCursor = instruction.entry.content.value;
64 |         continue;
65 |       }
66 | 
67 |       const entries = instruction.entries ?? [];
68 |       for (const entry of entries) {
69 |         const itemContent = entry.content?.itemContent;
70 |         if (itemContent?.userDisplayType === 'User') {
71 |           const userResultRaw = itemContent.user_results?.result;
72 | 
73 |           if (userResultRaw?.legacy) {
74 |             const profile = parseProfile(
75 |               userResultRaw.legacy,
76 |               userResultRaw.is_blue_verified,
77 |             );
78 | 
79 |             if (!profile.userId) {
80 |               profile.userId = userResultRaw.rest_id;
81 |             }
82 | 
83 |             profiles.push(profile);
84 |           }
85 |         } else if (entry.content?.cursorType === 'Bottom') {
86 |           bottomCursor = entry.content.value;
87 |         } else if (entry.content?.cursorType === 'Top') {
88 |           topCursor = entry.content.value;
89 |         }
90 |       }
91 |     }
92 |   }
93 | 
94 |   return { profiles, next: bottomCursor, previous: topCursor };
95 | }
96 | 


--------------------------------------------------------------------------------
/src/timeline-search.ts:
--------------------------------------------------------------------------------
  1 | import { Profile, parseProfile } from './profile';
  2 | import { QueryProfilesResponse, QueryTweetsResponse } from './timeline-v1';
  3 | import { SearchEntryRaw, parseLegacyTweet } from './timeline-v2';
  4 | import { Tweet } from './tweets';
  5 | 
  6 | export interface SearchTimeline {
  7 |   data?: {
  8 |     search_by_raw_query?: {
  9 |       search_timeline?: {
 10 |         timeline?: {
 11 |           instructions?: {
 12 |             entries?: SearchEntryRaw[];
 13 |             entry?: SearchEntryRaw;
 14 |             type?: string;
 15 |           }[];
 16 |         };
 17 |       };
 18 |     };
 19 |   };
 20 | }
 21 | 
 22 | export function parseSearchTimelineTweets(
 23 |   timeline: SearchTimeline,
 24 | ): QueryTweetsResponse {
 25 |   let bottomCursor: string | undefined;
 26 |   let topCursor: string | undefined;
 27 |   const tweets: Tweet[] = [];
 28 |   const instructions =
 29 |     timeline.data?.search_by_raw_query?.search_timeline?.timeline
 30 |       ?.instructions ?? [];
 31 |   for (const instruction of instructions) {
 32 |     if (
 33 |       instruction.type === 'TimelineAddEntries' ||
 34 |       instruction.type === 'TimelineReplaceEntry'
 35 |     ) {
 36 |       if (instruction.entry?.content?.cursorType === 'Bottom') {
 37 |         bottomCursor = instruction.entry.content.value;
 38 |         continue;
 39 |       } else if (instruction.entry?.content?.cursorType === 'Top') {
 40 |         topCursor = instruction.entry.content.value;
 41 |         continue;
 42 |       }
 43 | 
 44 |       const entries = instruction.entries ?? [];
 45 |       for (const entry of entries) {
 46 |         const itemContent = entry.content?.itemContent;
 47 |         if (itemContent?.tweetDisplayType === 'Tweet') {
 48 |           const tweetResultRaw = itemContent.tweet_results?.result;
 49 |           const tweetResult = parseLegacyTweet(
 50 |             tweetResultRaw?.core?.user_results?.result?.legacy,
 51 |             tweetResultRaw?.legacy,
 52 |           );
 53 | 
 54 |           if (tweetResult.success) {
 55 |             if (!tweetResult.tweet.views && tweetResultRaw?.views?.count) {
 56 |               const views = parseInt(tweetResultRaw.views.count);
 57 |               if (!isNaN(views)) {
 58 |                 tweetResult.tweet.views = views;
 59 |               }
 60 |             }
 61 | 
 62 |             tweets.push(tweetResult.tweet);
 63 |           }
 64 |         } else if (entry.content?.cursorType === 'Bottom') {
 65 |           bottomCursor = entry.content.value;
 66 |         } else if (entry.content?.cursorType === 'Top') {
 67 |           topCursor = entry.content.value;
 68 |         }
 69 |       }
 70 |     }
 71 |   }
 72 | 
 73 |   return { tweets, next: bottomCursor, previous: topCursor };
 74 | }
 75 | 
 76 | export function parseSearchTimelineUsers(
 77 |   timeline: SearchTimeline,
 78 | ): QueryProfilesResponse {
 79 |   let bottomCursor: string | undefined;
 80 |   let topCursor: string | undefined;
 81 |   const profiles: Profile[] = [];
 82 |   const instructions =
 83 |     timeline.data?.search_by_raw_query?.search_timeline?.timeline
 84 |       ?.instructions ?? [];
 85 | 
 86 |   for (const instruction of instructions) {
 87 |     if (
 88 |       instruction.type === 'TimelineAddEntries' ||
 89 |       instruction.type === 'TimelineReplaceEntry'
 90 |     ) {
 91 |       if (instruction.entry?.content?.cursorType === 'Bottom') {
 92 |         bottomCursor = instruction.entry.content.value;
 93 |         continue;
 94 |       } else if (instruction.entry?.content?.cursorType === 'Top') {
 95 |         topCursor = instruction.entry.content.value;
 96 |         continue;
 97 |       }
 98 | 
 99 |       const entries = instruction.entries ?? [];
100 |       for (const entry of entries) {
101 |         const itemContent = entry.content?.itemContent;
102 |         if (itemContent?.userDisplayType === 'User') {
103 |           const userResultRaw = itemContent.user_results?.result;
104 | 
105 |           if (userResultRaw?.legacy) {
106 |             const profile = parseProfile(
107 |               userResultRaw.legacy,
108 |               userResultRaw.is_blue_verified,
109 |             );
110 | 
111 |             if (!profile.userId) {
112 |               profile.userId = userResultRaw.rest_id;
113 |             }
114 | 
115 |             profiles.push(profile);
116 |           }
117 |         } else if (entry.content?.cursorType === 'Bottom') {
118 |           bottomCursor = entry.content.value;
119 |         } else if (entry.content?.cursorType === 'Top') {
120 |           topCursor = entry.content.value;
121 |         }
122 |       }
123 |     }
124 |   }
125 | 
126 |   return { profiles, next: bottomCursor, previous: topCursor };
127 | }
128 | 


--------------------------------------------------------------------------------
/src/timeline-tweet-util.ts:
--------------------------------------------------------------------------------
  1 | import { LegacyTweetRaw, TimelineMediaExtendedRaw } from './timeline-v1';
  2 | import { Photo, Video } from './tweets';
  3 | import { isFieldDefined, NonNullableField } from './type-util';
  4 | 
  5 | const reHashtag = /\B(\#\S+\b)/g;
  6 | const reCashtag = /\B(\$\S+\b)/g;
  7 | const reTwitterUrl = /https:(\/\/t\.co\/([A-Za-z0-9]|[A-Za-z]){10})/g;
  8 | const reUsername = /\B(\@\S{1,15}\b)/g;
  9 | 
 10 | export function parseMediaGroups(media: TimelineMediaExtendedRaw[]): {
 11 |   sensitiveContent?: boolean;
 12 |   photos: Photo[];
 13 |   videos: Video[];
 14 | } {
 15 |   const photos: Photo[] = [];
 16 |   const videos: Video[] = [];
 17 |   let sensitiveContent: boolean | undefined = undefined;
 18 | 
 19 |   for (const m of media
 20 |     .filter(isFieldDefined('id_str'))
 21 |     .filter(isFieldDefined('media_url_https'))) {
 22 |     if (m.type === 'photo') {
 23 |       photos.push({
 24 |         id: m.id_str,
 25 |         url: m.media_url_https,
 26 |         alt_text: m.ext_alt_text,
 27 |       });
 28 |     } else if (m.type === 'video') {
 29 |       videos.push(parseVideo(m));
 30 |     }
 31 | 
 32 |     const sensitive = m.ext_sensitive_media_warning;
 33 |     if (sensitive != null) {
 34 |       sensitiveContent =
 35 |         sensitive.adult_content ||
 36 |         sensitive.graphic_violence ||
 37 |         sensitive.other;
 38 |     }
 39 |   }
 40 | 
 41 |   return { sensitiveContent, photos, videos };
 42 | }
 43 | 
 44 | function parseVideo(
 45 |   m: NonNullableField<TimelineMediaExtendedRaw, 'id_str' | 'media_url_https'>,
 46 | ): Video {
 47 |   const video: Video = {
 48 |     id: m.id_str,
 49 |     preview: m.media_url_https,
 50 |   };
 51 | 
 52 |   let maxBitrate = 0;
 53 |   const variants = m.video_info?.variants ?? [];
 54 |   for (const variant of variants) {
 55 |     const bitrate = variant.bitrate;
 56 |     if (bitrate != null && bitrate > maxBitrate && variant.url != null) {
 57 |       let variantUrl = variant.url;
 58 |       const stringStart = 0;
 59 |       const tagSuffixIdx = variantUrl.indexOf('?tag=10');
 60 |       if (tagSuffixIdx !== -1) {
 61 |         variantUrl = variantUrl.substring(stringStart, tagSuffixIdx + 1);
 62 |       }
 63 | 
 64 |       video.url = variantUrl;
 65 |       maxBitrate = bitrate;
 66 |     }
 67 |   }
 68 | 
 69 |   return video;
 70 | }
 71 | 
 72 | export function reconstructTweetHtml(
 73 |   tweet: LegacyTweetRaw,
 74 |   photos: Photo[],
 75 |   videos: Video[],
 76 | ): string {
 77 |   const media: string[] = [];
 78 | 
 79 |   // HTML parsing with regex :)
 80 |   let html = tweet.full_text ?? '';
 81 | 
 82 |   html = html.replace(reHashtag, linkHashtagHtml);
 83 |   html = html.replace(reCashtag, linkCashtagHtml);
 84 |   html = html.replace(reUsername, linkUsernameHtml);
 85 |   html = html.replace(reTwitterUrl, unwrapTcoUrlHtml(tweet, media));
 86 | 
 87 |   for (const { url } of photos) {
 88 |     if (media.indexOf(url) !== -1) {
 89 |       continue;
 90 |     }
 91 | 
 92 |     html += `<br><img src="${url}"/>`;
 93 |   }
 94 | 
 95 |   for (const { preview: url } of videos) {
 96 |     if (media.indexOf(url) !== -1) {
 97 |       continue;
 98 |     }
 99 | 
100 |     html += `<br><img src="${url}"/>`;
101 |   }
102 | 
103 |   html = html.replace(/\n/g, '<br>');
104 | 
105 |   return html;
106 | }
107 | 
108 | function linkHashtagHtml(hashtag: string) {
109 |   return `<a href="https://twitter.com/hashtag/${hashtag.replace(
110 |     '#',
111 |     '',
112 |   )}">${hashtag}</a>`;
113 | }
114 | 
115 | function linkCashtagHtml(cashtag: string) {
116 |   return `<a href="https://twitter.com/search?q=%24${cashtag.replace(
117 |     '
#39;,
118 |     '',
119 |   )}">${cashtag}</a>`;
120 | }
121 | 
122 | function linkUsernameHtml(username: string) {
123 |   return `<a href="https://twitter.com/${username.replace(
124 |     '@',
125 |     '',
126 |   )}">${username}</a>`;
127 | }
128 | 
129 | function unwrapTcoUrlHtml(tweet: LegacyTweetRaw, foundedMedia: string[]) {
130 |   return function (tco: string) {
131 |     for (const entity of tweet.entities?.urls ?? []) {
132 |       if (tco === entity.url && entity.expanded_url != null) {
133 |         return `<a href="${entity.expanded_url}">${tco}</a>`;
134 |       }
135 |     }
136 | 
137 |     for (const entity of tweet.extended_entities?.media ?? []) {
138 |       if (tco === entity.url && entity.media_url_https != null) {
139 |         foundedMedia.push(entity.media_url_https);
140 |         return `<br><a href="${tco}"><img src="${entity.media_url_https}"/></a>`;
141 |       }
142 |     }
143 | 
144 |     return tco;
145 |   };
146 | }
147 | 


--------------------------------------------------------------------------------
/src/trends.test.ts:
--------------------------------------------------------------------------------
1 | import { getScraper } from './test-utils';
2 | 
3 | test('scraper can get trends', async () => {
4 |   const scraper = await getScraper();
5 |   const trends = await scraper.getTrends();
6 |   expect(trends).toHaveLength(20);
7 |   trends.forEach((trend) => expect(trend).not.toBeFalsy());
8 | }, 15000);
9 | 


--------------------------------------------------------------------------------
/src/trends.ts:
--------------------------------------------------------------------------------
 1 | import { addApiParams, requestApi } from './api';
 2 | import { TwitterAuth } from './auth';
 3 | import { TimelineV1 } from './timeline-v1';
 4 | 
 5 | export async function getTrends(auth: TwitterAuth): Promise<string[]> {
 6 |   const params = new URLSearchParams();
 7 |   addApiParams(params, false);
 8 | 
 9 |   params.set('count', '20');
10 |   params.set('candidate_source', 'trends');
11 |   params.set('include_page_configuration', 'false');
12 |   params.set('entity_tokens', 'false');
13 | 
14 |   const res = await requestApi<TimelineV1>(
15 |     `https://api.twitter.com/2/guide.json?${params.toString()}`,
16 |     auth,
17 |   );
18 |   if (!res.success) {
19 |     throw res.err;
20 |   }
21 | 
22 |   const instructions = res.value.timeline?.instructions ?? [];
23 |   if (instructions.length < 2) {
24 |     throw new Error('No trend entries found.');
25 |   }
26 | 
27 |   // Some of this is silly, but for now we're assuming we know nothing about the
28 |   // data, and that anything can be missing. Go has non-nilable strings and empty
29 |   // slices are nil, so it largely doesn't need to worry about this.
30 |   const entries = instructions[1].addEntries?.entries ?? [];
31 |   if (entries.length < 2) {
32 |     throw new Error('No trend entries found.');
33 |   }
34 | 
35 |   const items = entries[1].content?.timelineModule?.items ?? [];
36 |   const trends: string[] = [];
37 |   for (const item of items) {
38 |     const trend =
39 |       item.item?.clientEventInfo?.details?.guideDetails?.transparentGuideDetails
40 |         ?.trendMetadata?.trendName;
41 |     if (trend != null) {
42 |       trends.push(trend);
43 |     }
44 |   }
45 | 
46 |   return trends;
47 | }
48 | 


--------------------------------------------------------------------------------
/src/type-util.ts:
--------------------------------------------------------------------------------
 1 | export type NonNullableField<T, K extends keyof T> = {
 2 |   [P in K]-?: T[P];
 3 | } & T;
 4 | 
 5 | export function isFieldDefined<T, K extends keyof T>(key: K) {
 6 |   return function (value: T): value is NonNullableField<T, K> {
 7 |     return isDefined(value[key]);
 8 |   };
 9 | }
10 | 
11 | export function isDefined<T>(value: T | null | undefined): value is T {
12 |   return value != null;
13 | }
14 | 


--------------------------------------------------------------------------------
/src/types/spaces.ts:
--------------------------------------------------------------------------------
  1 | /**
  2 |  * Represents a Community that can host Spaces.
  3 |  */
  4 | export interface Community {
  5 |   id: string;
  6 |   name: string;
  7 |   rest_id: string;
  8 | }
  9 | 
 10 | /**
 11 |  * Represents the response structure for the CommunitySelectQuery.
 12 |  */
 13 | export interface CommunitySelectQueryResponse {
 14 |   data: {
 15 |     space_hostable_communities: Community[];
 16 |   };
 17 |   errors?: any[];
 18 | }
 19 | 
 20 | /**
 21 |  * Represents a Subtopic within a Category.
 22 |  */
 23 | export interface Subtopic {
 24 |   icon_url: string;
 25 |   name: string;
 26 |   topic_id: string;
 27 | }
 28 | 
 29 | /**
 30 |  * Represents a Category containing multiple Subtopics.
 31 |  */
 32 | export interface Category {
 33 |   icon: string;
 34 |   name: string;
 35 |   semantic_core_entity_id: string;
 36 |   subtopics: Subtopic[];
 37 | }
 38 | 
 39 | /**
 40 |  * Represents the data structure for BrowseSpaceTopics.
 41 |  */
 42 | export interface BrowseSpaceTopics {
 43 |   categories: Category[];
 44 | }
 45 | 
 46 | /**
 47 |  * Represents the response structure for the BrowseSpaceTopics query.
 48 |  */
 49 | export interface BrowseSpaceTopicsResponse {
 50 |   data: {
 51 |     browse_space_topics: BrowseSpaceTopics;
 52 |   };
 53 |   errors?: any[];
 54 | }
 55 | 
 56 | /**
 57 |  * Represents the result details of a Creator.
 58 |  */
 59 | export interface CreatorResult {
 60 |   __typename: string;
 61 |   id: string;
 62 |   rest_id: string;
 63 |   affiliates_highlighted_label: Record<string, any>;
 64 |   has_graduated_access: boolean;
 65 |   is_blue_verified: boolean;
 66 |   profile_image_shape: string;
 67 |   legacy: {
 68 |     following: boolean;
 69 |     can_dm: boolean;
 70 |     can_media_tag: boolean;
 71 |     created_at: string;
 72 |     default_profile: boolean;
 73 |     default_profile_image: boolean;
 74 |     description: string;
 75 |     entities: {
 76 |       description: {
 77 |         urls: any[];
 78 |       };
 79 |     };
 80 |     fast_followers_count: number;
 81 |     favourites_count: number;
 82 |     followers_count: number;
 83 |     friends_count: number;
 84 |     has_custom_timelines: boolean;
 85 |     is_translator: boolean;
 86 |     listed_count: number;
 87 |     location: string;
 88 |     media_count: number;
 89 |     name: string;
 90 |     needs_phone_verification: boolean;
 91 |     normal_followers_count: number;
 92 |     pinned_tweet_ids_str: string[];
 93 |     possibly_sensitive: boolean;
 94 |     profile_image_url_https: string;
 95 |     profile_interstitial_type: string;
 96 |     screen_name: string;
 97 |     statuses_count: number;
 98 |     translator_type: string;
 99 |     verified: boolean;
100 |     want_retweets: boolean;
101 |     withheld_in_countries: string[];
102 |   };
103 |   tipjar_settings: Record<string, any>;
104 | }
105 | 
106 | /**
107 |  * Represents user results within an Admin.
108 |  */
109 | export interface UserResults {
110 |   rest_id: string;
111 |   result: {
112 |     __typename: string;
113 |     identity_profile_labels_highlighted_label: Record<string, any>;
114 |     is_blue_verified: boolean;
115 |     legacy: Record<string, any>;
116 |   };
117 | }
118 | 
119 | /**
120 |  * Represents an Admin participant in an Audio Space.
121 |  */
122 | export interface Admin {
123 |   periscope_user_id: string;
124 |   start: number;
125 |   twitter_screen_name: string;
126 |   display_name: string;
127 |   avatar_url: string;
128 |   is_verified: boolean;
129 |   is_muted_by_admin: boolean;
130 |   is_muted_by_guest: boolean;
131 |   user_results: UserResults;
132 | }
133 | 
134 | /**
135 |  * Represents Participants in an Audio Space.
136 |  */
137 | export interface Participants {
138 |   total: number;
139 |   admins: Admin[];
140 |   speakers: any[];
141 |   listeners: any[];
142 | }
143 | 
144 | /**
145 |  * Represents Metadata of an Audio Space.
146 |  */
147 | export interface Metadata {
148 |   rest_id: string;
149 |   state: string;
150 |   media_key: string;
151 |   created_at: number;
152 |   started_at: number;
153 |   ended_at: string;
154 |   updated_at: number;
155 |   content_type: string;
156 |   creator_results: {
157 |     result: CreatorResult;
158 |   };
159 |   conversation_controls: number;
160 |   disallow_join: boolean;
161 |   is_employee_only: boolean;
162 |   is_locked: boolean;
163 |   is_muted: boolean;
164 |   is_space_available_for_clipping: boolean;
165 |   is_space_available_for_replay: boolean;
166 |   narrow_cast_space_type: number;
167 |   no_incognito: boolean;
168 |   total_replay_watched: number;
169 |   total_live_listeners: number;
170 |   tweet_results: Record<string, any>;
171 |   max_guest_sessions: number;
172 |   max_admin_capacity: number;
173 | }
174 | 
175 | /**
176 |  * Represents Sharings within an Audio Space.
177 |  */
178 | export interface Sharings {
179 |   items: any[];
180 |   slice_info: Record<string, any>;
181 | }
182 | 
183 | /**
184 |  * Represents an Audio Space.
185 |  */
186 | export interface AudioSpace {
187 |   metadata: Metadata;
188 |   is_subscribed: boolean;
189 |   participants: Participants;
190 |   sharings: Sharings;
191 | }
192 | 
193 | /**
194 |  * Represents the response structure for the AudioSpaceById query.
195 |  */
196 | export interface AudioSpaceByIdResponse {
197 |   data: {
198 |     audioSpace: AudioSpace;
199 |   };
200 |   errors?: any[];
201 | }
202 | 
203 | /**
204 |  * Represents the variables required for the AudioSpaceById query.
205 |  */
206 | export interface AudioSpaceByIdVariables {
207 |   id: string;
208 |   isMetatagsQuery: boolean;
209 |   withReplays: boolean;
210 |   withListeners: boolean;
211 | }
212 | 
213 | export interface LiveVideoSource {
214 |   location: string;
215 |   noRedirectPlaybackUrl: string;
216 |   status: string;
217 |   streamType: string;
218 | }
219 | 
220 | export interface LiveVideoStreamStatus {
221 |   source: LiveVideoSource;
222 |   sessionId: string;
223 |   chatToken: string;
224 |   lifecycleToken: string;
225 |   shareUrl: string;
226 |   chatPermissionType: string;
227 | }
228 | 
229 | export interface AuthenticatePeriscopeResponse {
230 |   data: {
231 |     authenticate_periscope: string;
232 |   };
233 |   errors?: any[];
234 | }
235 | 
236 | export interface LoginTwitterTokenResponse {
237 |   cookie: string;
238 |   user: {
239 |     class_name: string;
240 |     id: string;
241 |     created_at: string;
242 |     is_beta_user: boolean;
243 |     is_employee: boolean;
244 |     is_twitter_verified: boolean;
245 |     verified_type: number;
246 |     is_bluebird_user: boolean;
247 |     twitter_screen_name: string;
248 |     username: string;
249 |     display_name: string;
250 |     description: string;
251 |     profile_image_urls: {
252 |       url: string;
253 |       ssl_url: string;
254 |       width: number;
255 |       height: number;
256 |     }[];
257 |     twitter_id: string;
258 |     initials: string;
259 |     n_followers: number;
260 |     n_following: number;
261 |   };
262 |   type: string;
263 | }
264 | 


--------------------------------------------------------------------------------
/test-assets/test-image.jpeg:
--------------------------------------------------------------------------------
https://raw.githubusercontent.com/elizaOS/agent-twitter-client/fd5cb982c14c1ea75f30b2739ae9a9eb2d2ae394/test-assets/test-image.jpeg


--------------------------------------------------------------------------------
/test-assets/test-video.mp4:
--------------------------------------------------------------------------------
https://raw.githubusercontent.com/elizaOS/agent-twitter-client/fd5cb982c14c1ea75f30b2739ae9a9eb2d2ae394/test-assets/test-video.mp4


--------------------------------------------------------------------------------
/test-setup.js:
--------------------------------------------------------------------------------
1 | globalThis.PLATFORM_NODE = false;
2 | globalThis.PLATFORM_NODE_JEST = true;
3 | 


--------------------------------------------------------------------------------
/tsconfig.json:
--------------------------------------------------------------------------------
 1 | {
 2 |   "extends": "@tsconfig/node16/tsconfig.json",
 3 |   "exclude": ["node_modules", "dist", "**/*.test.ts", "src/test-utils.ts"],
 4 |   "compilerOptions": {
 5 |     // TODO: Remove "dom" from this when support for Node 16 is dropped
 6 |     "lib": ["es2021", "dom"],
 7 |     "outDir": "./dist",
 8 |     "rootDir": "./src",
 9 |     "sourceMap": true,
10 |     "declaration": true,
11 |     "declarationMap": true,
12 |     "declarationDir": "./dist",
13 |     "strict": true,
14 |     "noImplicitAny": true,
15 |     "esModuleInterop": true,
16 |     "forceConsistentCasingInFileNames": true,
17 |     "skipLibCheck": true,
18 |     "stripInternal": true,
19 |     "types": ["jest"]
20 |   }
21 | }
22 | 


--------------------------------------------------------------------------------
/typedoc.json:
--------------------------------------------------------------------------------
1 | {
2 |     "entryPointStrategy": "expand",
3 |     "entryPoints": ["src"],
4 |     "exclude": ["**/*.test.ts", "**/_*.ts"],
5 |     "hideGenerator": true
6 | }


--------------------------------------------------------------------------------
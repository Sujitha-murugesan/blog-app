// Sample content used by `npm run seed`. Newest post first.
const DEMO_USER = {
  name: 'Demo User',
  email: 'demo@blogapp.com',
  password: 'demo1234',
  bio: 'I write about the web and the people who build it.',
};

const POSTS = [
  {
    daysAgo: 1,
    category: 'CSS',
    title: 'Design for the small screen first',
    content: `Most layout bugs on phones come from designing the wide version first and then squeezing it down. Flip the order.

Write your base styles for a narrow screen: a single column, comfortable padding, and text that is at least 16px so mobile browsers do not zoom in on form fields. Everything stacks naturally because block elements already do.

Then widen the viewport and ask a simple question: what breaks? Add a media query only where the layout genuinely needs to change, such as switching a list into two columns at 700px.

CSS Grid helps here. A rule like grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)) gives you one column on a phone, two on a tablet and three on a desktop with no media queries at all.

Finally, test on a real device. Browser dev tools are great, but nothing shows you a tap target that is too small like your own thumb.`,
  },
  {
    daysAgo: 3,
    category: 'JavaScript',
    title: 'async/await without the confusion',
    content: `async/await is syntax that lets you write asynchronous code that reads from top to bottom.

An async function always returns a promise. Inside it, await pauses that function until the promise settles, without blocking the rest of the page.

Three habits prevent most bugs. First, wrap awaited calls in try/catch so a failed request does not disappear silently. Second, remember that fetch only rejects on network errors: a 404 or 500 response still resolves, so check response.ok yourself. Third, do not await things one by one when they do not depend on each other. Start them together and wait for all of them with Promise.all.

Once those three feel natural, most of the confusion around promises goes away.`,
  },
  {
    daysAgo: 5,
    category: 'HTML',
    title: 'Semantic HTML is accessibility you get for free',
    content: `Before you reach for ARIA attributes, check whether a native element already does the job.

A button is focusable, responds to Enter and Space, and is announced as a button by screen readers. A div with a click handler gives you none of that until you rebuild it by hand.

Use headings in order so people who navigate by heading can skim your page. Use nav, main and footer landmarks so assistive technology can jump straight to the content. Give every form field a label element tied to the input with for and id, which also makes the tap target larger.

None of this needs extra libraries or extra effort. It is simply choosing the right element the first time.`,
  },
  {
    daysAgo: 8,
    category: 'Career',
    title: 'What to show when you have no job history',
    content: `Hiring managers know that most junior developers have little work history. What they want is evidence that you can finish things.

Pick two or three small projects and take them all the way: a working deployed link, a clear README that explains what the project does and how to run it, and a short note about one problem you got stuck on and how you solved it.

Quality beats quantity. A tidy blog app with authentication and a good README beats ten half-finished tutorials.

Finally, write about what you build. A short post about a bug you fixed shows how you think, and that is exactly what an interviewer is trying to find out.`,
  },
  {
    daysAgo: 12,
    category: 'Lifestyle',
    title: 'A 25-minute writing habit that sticks',
    content: `If sitting down to write feels heavy, make the session small enough that skipping it feels silly.

Set a timer for 25 minutes, put your phone in another room and write without editing. The goal is a messy first draft, not a good one. Stop when the timer ends, even if you are mid-sentence; ending on a half-finished thought makes it easier to restart tomorrow.

Pick the same time every day and attach it to something you already do, like your morning coffee. After two weeks it stops being a decision and becomes part of the day.

Edit on a different day. Writing and editing use different muscles, and mixing them is what makes people stall.`,
  },
  {
    daysAgo: 16,
    category: 'General',
    title: 'Welcome to BlogApp',
    content: `Welcome! BlogApp is a place to read and publish short posts.

Anyone can browse and search the posts on the home page, filter them by category, and read them in full. To write your own, register for a free account. From your dashboard you can create, edit and delete posts, and from your profile you can update your bio, change your password and sign out of every device.

Your posts are stored in MongoDB and your session is protected by a secure, HTTP-only cookie. Have a look around, then write something.`,
  },
];

module.exports = { DEMO_USER, POSTS };

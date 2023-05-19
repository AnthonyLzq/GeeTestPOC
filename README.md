# GeeTestPOC

## Prerequisites

In order to test this POC locally you need to have a `.env` like its shown in [.env.example](./.env.example).

## Testing locally

There are two solvers GeeTest captcha in the present project, the slider solver and the space one. These POC are based on the following tutorials:

- [GeeTest slider solver](https://scraperbox.com/blog/solving-a-geetest-slider-captcha-with-puppeteer)
- [GeeTest space solver](https://www.youtube.com/watch?v=wPU8BTh5vKk)

In order to see there in action just run the following in your terminal:

```bash
pnpm run test:local
```

This will run a suit of unit test that will try to resolve the two different GeeTest captchas in different sites.

In case you want to test the slider or space captcha only, please run the following in your terminal

```bash
pnpm run test:X:local
```

Where "X" can be replaced with `space` or `slider`.

## Observations

Notice that currently the POC for the space captcha is not complete, since the page we are trying to solve its captcha is blocking us, we can go further to see it works or not. Because of this the `space` unit test will always be successful, even when the can not go further as mentioned before.

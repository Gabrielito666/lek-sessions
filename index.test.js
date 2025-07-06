// index.tests.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const useLekSessions = require('./index.js');
const cryptools = require('lek-cryptools');

const TMP_DIR = path.join(__dirname, 'tmp_tests');
const DB_NAME = 'test.db';
const dbPath = path.join(TMP_DIR, DB_NAME);
const SECRET = 'my-secret-key';

const wait = ms => new Promise(r => setTimeout(r, ms));

const initData = () => fs.mkdirSync(TMP_DIR, { recursive: true });
const clean = () =>
{
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  if (fs.existsSync(TMP_DIR)) fs.rmSync(TMP_DIR, { recursive: true });
};

initData();
let lek = useLekSessions(SECRET, TMP_DIR, DB_NAME);

const createAndConfirmTest = async() =>
{
  const userId = "id_user"
  const realCookie = await lek.create(userId);
  const realConfirmation = await lek.confirm(realCookie);

  if(userId === realConfirmation)
  {
    console.log("CREATE AND CONFIRM PROOF APROVED");
  }
  else
  {
    console.log("CREATE AND CONFIRM PROOF REJECTED");
  }
}

const rejectWithFalseCookieTest = async() =>
{
  const userId = "id_user"
  const realCookie = await lek.create(userId);
  const realConfirmation = await lek.confirm("a-false-cookie-1-2-3-4");

  if(realConfirmation === false)
  {
    console.log("REJECT WITH FALSE COOKIE PROOF APROVED");
  }
  else
  {
    console.log("REJECT WITH FALSE COOKIE PROOF REJECTED");
  }
}

const createAndRejectCorruptedCookieTest = async() =>
{
  const userId = "id_user"
  const realCookie = await lek.create(userId);
  const corruptedCookie = realCookie + "trash-bytes";
  const realConfirmation = await lek.confirm(corruptedCookie);

  if(realConfirmation === false)
  {
    console.log("CREATE AND REJECT CORRUPTED COOKIE PROOF APROVED");
  }
  else
  {
    console.log("CREATE AND REJECT CORRUPTED COOKIE PROOF REJECTED");
  }
}

const main = async() =>
{
  await createAndConfirmTest();
  await rejectWithFalseCookieTest();
  await createAndRejectCorruptedCookieTest();

  clean();
}
main();
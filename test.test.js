const useLekSessions = require('.');

const main = async() =>
{
    const { create, confirm } = await useLekSessions('a-secret');

    const myCookie = await create('este-es-un-super-id');

    console.log(myCookie);

    const UserId = await confirm(myCookie);
    const myNotUserId = await confirm('a-false-key');

    console.log(UserId);
    console.log(myNotUserId);

}
main();
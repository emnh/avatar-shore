const meriyah = require('meriyah');
const astring = require('astring');
const util = require('util')
const _ = require('lodash');
require('deepdash')(_);

const log = (x) => console.log(util.inspect(x, {showHidden: false, depth: null}));

const program = `
fun bootstrap
  const state
		dict
			array program
			array stack
			dict functions
  fun parse
    return
      call
				member meriyah parseScript
				arg expr
`;

const bootstrap = function() {
  const state = {
    program: [],
    stack: [],
    astPlugs: {}
  };

	const byStringPath = function(o, s, value) {
    s = s.replace(/\[(\w+)\]/g, '.$1'); // convert indexes to properties
    s = s.replace(/^\./, '');           // strip a leading dot
    var a = s.split('.');
    for (var i = 0, n = a.length; i < n; ++i) {
        var k = a[i];
        if (k in o) {
						if (i + 1 == n && value !== undefined) {
							o[k] = value;
						}
            o = o[k];
        } else {
            return;
        }
    }
		return o;
	}

  const parse = function(expression, wrap = false, selectBody = true) {
    const expr = wrap ? ('function wrap() { ' + expression + ' }') : expression;
    const ast = meriyah.parseScript(expr);
    ast.body[0] = wrap ? ast.body[0].body.body[0] : ast.body[0];
    const astBody = selectBody ? ast.body[0] : ast;

    const discardPath =
      _.findPathDeep(astBody,
        (x, key, parentX) =>
          {
            //log({x, key, parentX});
          return x && x.name === '_'; }, { leavesOnly: false } );
          //(key === 'body' || key === 'init'); }, { leavesOnly: false } );
		const discard =
			discardPath === undefined ?
				undefined :
				byStringPath(astBody, discardPath.replace(/\.[^\.]+$/, ''));
		const selectLargestChild = (discard) => {
			let maxSize = 0;
			let child = null;
			for (let key in discard) {
				log({key});
				const size = JSON.stringify(discard[key]).length;
				if (size > maxSize) {
					maxSize = size;
					child = discard[key];
				}
			}
			log({ child });
			return child;
		};
		const y = selectLargestChild;
    const astSub =
			discard !== undefined ?
				y(y(y(discard))) : astBody;
    const $args = [];
		for (let i = 0; i < 8; i++) {
			 $args.push(_.findPathDeep(astSub, (x) => typeof x === 'string' && x.startsWith('$' + i)));
		}
    const nextPath = _.findPathDeep(astSub, (x) => typeof x === 'string' && x.startsWith('$next'));
    const bodyPath0 = _.findPathDeep(astSub, (x) => typeof x === 'string' && x.startsWith('$body0'));
    const bodyPath1 = _.findPathDeep(astSub, (x) => typeof x === 'string' && x.startsWith('$body1'));
		const hasNext = nextPath !== undefined;
		const hasBody = bodyPath0 !== undefined;
    const isPathArray = bodyPath1 !== undefined;
    let commonAncestorIndex = 0;
    if (hasBody && isPathArray) {
      for (let i = 0; i < Math.min(bodyPath0.length, bodyPath1.length); i++) {
        if (bodyPath0.charAt(i) === bodyPath1.charAt(i)) {
          commonAncestorIndex = i;
        } else {
          break;
        }
      }
    }
    const commonAncestor = commonAncestorIndex > 0 ? bodyPath0.slice(0, commonAncestorIndex) : '';
		const astSubJSON = JSON.stringify(astSub);

    log({ $args, discardPath, discard, commonAncestor, nextPath, bodyPath0, bodyPath1, isPathArray, astSub });

    /*
    const printedAST = util.inspect(astSub, {showHidden: false, depth: null});
    const rex = new RegExp(/\[[^\[]+\$body[^\]]+\]/, 'm');
    let substAST = printedAST;
    substAST = substAST.replace("'$body0'", "body[0]");
    substAST = substAST.replace(rex, 'body');
    for (let i = 0; i < 10; i++) {
      substAST = substAST.replace("'$" + i + "'", "args[" + i + "]");
    }*/
    const fun = (args) => {
			const ast = JSON.parse(astSubJSON);
			if (args !== undefined && args.length > 0) {
				for (let i = 0; i < args.length; i++) {
					byStringPath(ast, $args[i], args[i]);
					//log({ set: "SET $0", $0, ast, args });
				}
			}
			const body = hasBody && isPathArray ? byStringPath(ast, commonAncestor) : [];
			if (body === undefined) {
				throw "body undefined: " + bodyPath0 + " : " + commonAncestor;
			}
			if (hasBody && isPathArray) {
				body.length = 0;
			}
			const pushBody =
				hasBody && isPathArray ? (x) => body.push(x) : (x) => x;
			const pushNext =
				hasNext ? (x) => byStringPath(ast, nextPath.replace(/\.name$/, ''), x) : (x) => x;
			// Now combine the two: first push next line to $next (if applicable),
			// then remaining to $body0,$body1...
			let pushedNext = !hasNext;
			const pushAll = (x) => {
				if (pushedNext) {
					pushBody(x);
				} else {
					log({ next: x });
					pushNext(x);
					pushedNext = true;
				}
			};

			return [pushAll, ast];
    };
    return fun;
  };

  const push = function(body, ast) {
    state.stack[state.stack.length - 1](ast);
    state.stack.push(body);
  };

  const pop = function(body) {
    state.stack.pop();
  };

	// $0: arg1 
	// $1: arg2
	// ...$N: argN
	// $next: Insert next indented line here.
	// $body0, $body1: Insert indented lines (after $next) here.
	// _: discard from top this syntax element
  state.astPlugs = {
    program: parse('$body0; $body1;', false, false),
    fun: parse('const $0 = function(){ $body0; $body1; };'),
    call: parse('$next($body0, $body1);'),
    block: parse('{ $body0; $body1; };'),
    return: parse('function _() { return $next; }', false, false),
    const: parse('const $0 = $next;'),
    array: parse('const _ = { $0: [ $body0, $body1 ] }'),
    dict: parse('const _  = { $0: { a: $body0, b: $body1 } }'),
    member: parse('$0.$1'),
    arg: parse('_($0)'),
  };

  const exec = function(program) {
    const [programBody, programAST] = (state.astPlugs['program'])();
    //state.stack[state.stack.length - 1].push(state.program);
    state.program = programAST;
    state.stack.push(programBody);

    const lines = program.match(/[^\r\n]+/g);

    let prevIndentLevel = -2;

    for (let i = 0; i < lines.length; i++) {
      const indentedLine = lines[i];
      if (!indentedLine.replace(/\s/g, '').length) {
        continue;
      }
      const indentLevel = indentedLine.search(/\S/);
      log({i: indentLevel, p: prevIndentLevel});
      const indentDiff = prevIndentLevel - indentLevel;
      prevIndentLevel = indentLevel;
      const line = indentedLine.replace(/^\s*/, '');
      const tokens = line.split(' ');
      const funName = tokens[0];
      const fun = state.astPlugs[funName];
      if (fun === undefined) {
        console.log(line);
        console.log("ERROR: undefined function: " + funName);
        throw ("ERROR: undefined function: " + funName);
      } else {
        log(tokens);
        const [body, ast] = fun(tokens.slice(1));
        if (body === undefined) {
          throw ("ERROR: undefined body for " + funName);
        }
        for (let i = 0; i <= indentDiff; i += 2) {
          //log(['pop', line])
          pop();
        }
        //log({body: body, ast: ast, stack: state.stack});
				const prevProgram = util.inspect(ast, { showHidden: false, depth: null });
        push(body, ast);
				const strProgram = util.inspect(ast, { showHidden: false, depth: null });
    		if (strProgram.includes('Circular')) {
					log({ line, prevProgram, strProgram });
					throw 'circular';
				};
        //log({body: body, ast: ast, stack: state.stack});
      }
    }

    log(state.program);
    return astring.generate(state.program, {});
  };

  return exec;
};

const out = (bootstrap())(program);
console.log(out);

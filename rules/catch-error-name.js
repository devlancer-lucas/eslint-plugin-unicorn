'use strict';
const astUtils = require('eslint-ast-utils');
const getDocsUrl = require('./utils/get-docs-url');

// Matches someObj.then([FunctionExpression | ArrowFunctionExpression])
function isLintablePromiseCatch(node) {
	const callee = node.callee;

	if (callee.type !== 'MemberExpression') {
		return false;
	}

	const property = callee.property;

	if (property.type !== 'Identifier' || property.name !== 'catch') {
		return false;
	}

	if (node.arguments.length === 0) {
		return false;
	}

	const arg0 = node.arguments[0];

	return arg0.type === 'FunctionExpression' || arg0.type === 'ArrowFunctionExpression';
}

function indexifyName(name, scope) {
	const variables = scope.variableScope.set;

	let index = 1;
	while (variables.has(index === 1 ? name : name + index)) {
		index++;
	}

	return name + (index === 1 ? '' : index);
}

const create = context => {
	const opts = Object.assign({}, {name: 'err'}, context.options[0]);
	const name = opts.name;
	const caughtErrorsIgnorePattern = new RegExp(opts.caughtErrorsIgnorePattern || '^_$');
	const stack = [];

	function push(value) {
		if (stack.length === 1) {
			stack[0] = true;
		}

		stack.push(stack.length > 0 || value);
	}

	function popAndReport(node) {
		const value = stack.pop();

		if (node && caughtErrorsIgnorePattern.test(node.name)) {
			return;
		}

		if (value !== true) {
			context.report({
				node,
				message: `The catch parameter should be named \`${value || name}\`.`
			});
		}
	}

	return {
		CallExpression: node => {
			if (isLintablePromiseCatch(node)) {
				const params = node.arguments[0].params;

				if (params.length > 0 && params[0].name === '_') {
					push(!astUtils.containsIdentifier('_', node.arguments[0].body));
					return;
				}

				const errName = indexifyName(name, context.getScope());
				push(params.length === 0 || params[0].name === errName || errName);
			}
		},
		'CallExpression:exit': node => {
			if (isLintablePromiseCatch(node)) {
				popAndReport(node.arguments[0].params[0]);
			}
		},
		CatchClause: node => {
			if (node.param.name === '_') {
				push(!astUtils.someContainIdentifier('_', node.body.body));
				return;
			}

			const errName = indexifyName(name, context.getScope());
			push(node.param.name === errName || errName);
		},
		'CatchClause:exit': node => {
			popAndReport(node.param);
		}
	};
};

const schema = [{
	type: 'object',
	properties: {
		name: {
			type: 'string'
		},
		caughtErrorsIgnorePattern: {
			type: 'string'
		}
	}
}];

module.exports = {
	create,
	meta: {
		docs: {
			url: getDocsUrl()
		},
		schema
	}
};

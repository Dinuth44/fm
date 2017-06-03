// Copyright (c) 2016, Frappe Technologies Pvt. Ltd. and contributors
// For license information, please see license.txt

frappe.ui.form.on('Loan', {
	onload: function(frm) {
		// to filter some link fields
		frm.trigger("set_queries")
		frm.trigger("set_account_defaults")
	},
	refresh: function(frm) {
		frm.trigger("needs_to_refresh")		
		frm.trigger("toggle_fields")
		frm.trigger("add_others_buttons")
		frm.trigger("add_menu_buttons")
		frm.trigger("beatify_repayment_table")
	},
	needs_to_refresh: function(frm) {
		// check if it's a new doc
		if (frm.doc.__islocal) return

		// check the last time it was modified in the DB
		frappe.db.get_value(frm.doctype, { "name" : frm.docname }, ["modified", "paid_by_now"], function(data) {
			if (frm.doc.modified != data.modified || frm.doc.paid_by_now != data.paid_by_now){
				// reload the doc because it's out of date
				frm.reload_doc()
			}
		})
	},
	gross_loan_amount: function(frm) {
		var expense_rate_dec = frm.doc.legal_expense_rate / 100
		var loan_amount = frm.doc.gross_loan_amount * (expense_rate_dec + 1)
		frm.set_value("loan_amount", loan_amount)
	},
	make_jv: function(frm) {
		$c('runserverobj', { "docs": frm.doc, "method": "make_jv_entry" }, function(r) {
			if (r.message) {
				var doc = frappe.model.sync(r.message)[0]
				frappe.set_route("Form", doc.doctype, doc.name)
			}
		})
	},
	make_payment_entry: function(frm) {
		$c('runserverobj', { "docs": frm.doc, "method": "make_payment_entry" }, function(response) {
			if (response.message) {
				var doc = frappe.model.sync(response.message)[0]
				frappe.set_route("Form", doc.doctype, doc.name)
			}
		})
	},
	mode_of_payment: function(frm) {
		frappe.call({
			method: "erpnext.accounts.doctype.sales_invoice.sales_invoice.get_bank_cash_account",
			args: {
				"mode_of_payment": frm.doc.mode_of_payment,
				"company": frm.doc.company
			},
			callback: function(r, rt) {
				if (r.message) {
					frm.set_value("payment_account", r.message.account)
				}
			}
		})
	},

	loan_application: function(frm) {
		// exit the function and do nothing
		// if loan application is triggered but has not data
		if (!frm.doc.loan_application) return

		frm.call({
			method: "fm.finance_manager.doctype.loan.loan.get_loan_application",
			args: {
				"loan_application": frm.doc.loan_application
			},
			callback: function(response) {
				var loan_application = response.message

				// exit the callback if no data came from the SV
				if (!loan_application) return

				var field_list = [
					"loan_type", "loan_amount",
					"repayment_method", "monthly_repayment_amount",
					"repayment_periods", "rate_of_interest"
				]

				// assign the common values from the application to the loan
				$.each(field_list, function(idx, field) {
					frm.set_value(field, loan_application[field])
				})
			}
		})
	},
	repayment_method: function(frm) {
		frm.trigger("toggle_fields")
	},
	toggle_fields: function(frm) {
		frm.toggle_enable("monthly_repayment_amount", frm.doc.repayment_method == "Repay Fixed Amount per Period")
		frm.toggle_enable("repayment_periods", frm.doc.repayment_method == "Repay Over Number of Periods")
		frm.trigger("fix_table_header")
	},
	add_menu_buttons: function(frm) {
		// validate the is not a new document
		if (!frm.doc.__islocal) {
			frm.add_custom_button(__("Duplicar"), function(data) {
				frm.copy_doc()
			}, "Menu")

			frm.add_custom_button(__("Refrescar"), function(data) {
				frm.reload_doc()
			}, "Menu")

			frm.add_custom_button(__("Nuevo"), function(data) {
				frappe.new_doc(frm.doctype, true)
			}, "Menu")

			if (!frm.doc.docstatus == 1) {
				frm.add_custom_button(__("Eliminar"), function(data) {
					frappe.model.delete_doc(frm.doctype, frm.docname, function(response) {
						if (response) {
							frappe.set_route("List", frm.doctype)
						}
					})
				}, "Menu")
			}
		}
	},
	add_others_buttons: function(frm) {
		// validate that the document is submitted
		if (frm.doc.docstatus == 1) {
			if (frm.doc.status == "Sanctioned" || frm.doc.status == "Partially Disbursed") {
				frm.add_custom_button(__('Make Disbursement Entry'), function() {
					frm.trigger("make_jv")
				})
			} else if (frm.doc.status == "Fully Disbursed") {
				frm.add_custom_button(__('Payment Entry'), function() {
					frm.trigger("make_payment_entry")
				})

				frm.add_custom_button(__('Disbursement Entry'), function() {
					frappe.db.get_value("Journal Entry", { "loan" : frm.docname, "docstatus": ["!=", 2] }, "name", function(data) {
						frappe.set_route("Form", "Journal Entry", data.name)
					})
				}, "Ver")

				frm.add_custom_button(__('Payment Entry'), function() {
					frappe.set_route("List", "Payment Entry", { "loan": frm.docname })
				}, "Ver")
			}
		}
	},
	set_queries: function(frm) {
		root_types = {
			"interest_income_account" : "Income",
			"expenses_account" : "Income",
			"payment_account" : "Asset",
			"customer_loan_account" : "Asset"
		}

		fields = [
			"interest_income_account", "expenses_account", 
			"payment_account", "customer_loan_account"
		]

		$.each(fields, function(idx, field) {
			frm.set_query(field, function() {
				return {
					"filters": {
						"company": frm.doc.company,
						"root_type": root_types[field],
						"is_group": 0
					}
				}
			})
		})

		frm.set_query("loan_application", function() {
			return {
				"filters": {
					"docstatus": 1,
					"status": "Approved",
					"status": ["!=","Linked"]
				}
			}
		})
	},
	fix_table_header: function(frm) {
		setTimeout(function() {
			$("[data-fieldname=repayment_schedule] [data-fieldname=fecha]").css("width", "12%")
			$("[data-fieldname=repayment_schedule] [data-fieldname=cuota]").css("width", "10%")
			$("[data-fieldname=repayment_schedule] [data-fieldname=balance_capital]").css("width", "10%")
			$("[data-fieldname=repayment_schedule] [data-fieldname=balance_interes]").css("width", "10%")
			$("[data-fieldname=repayment_schedule] [data-fieldname=capital_acumulado]").css("width", "10%")
			$("[data-fieldname=repayment_schedule] [data-fieldname=interes_acumulado]").css("width", "10%")
			$("[data-fieldname=repayment_schedule] [data-fieldname=pagos_acumulados]").css("width", "10%")
			$("[data-fieldname=repayment_schedule] [data-fieldname=estado]").css("width", "14%")
			$("[data-fieldname=repayment_schedule] .close.btn-open-row").parent().css("width", "5%")
			$("[data-fieldname=repayment_schedule] .grid-heading-row .col.col-xs-1").css("height", 60)
			$("[data-fieldname=repayment_schedule] .grid-heading-row .col.col-xs-2").css("height", 60)

			fecha = $("[data-fieldname=repayment_schedule] [data-fieldname=fecha] .static-area.ellipsis:first")
			fecha.html("<br>Fecha")

			cuota = $("[data-fieldname=repayment_schedule] [data-fieldname=cuota] .static-area.ellipsis:first")
			cuota.html("<br>Cuota")

			balance_capital = $("[data-fieldname=repayment_schedule] [data-fieldname=balance_capital] .static-area.ellipsis:first")
			balance_capital.html("Bal.<br>Capital")

			balance_interes = $("[data-fieldname=repayment_schedule] [data-fieldname=balance_interes] .static-area.ellipsis:first")
			balance_interes.html("Bal.<br>Interes")

			capital_acumulado = $("[data-fieldname=repayment_schedule] [data-fieldname=capital_acumulado] .static-area.ellipsis:first")
			capital_acumulado.html("Capital<br>Acum.")

			interes_acumulado = $("[data-fieldname=repayment_schedule] [data-fieldname=interes_acumulado] .static-area.ellipsis:first")
			interes_acumulado.html("Interes<br>Acum.")

			pagos_acumulados = $("[data-fieldname=repayment_schedule] [data-fieldname=pagos_acumulados] .static-area.ellipsis:first")
			pagos_acumulados.html("Pagos<br>Acum.")

			estado = $("[data-fieldname=repayment_schedule] [data-fieldname=estado] .static-area.ellipsis:first")
			estado.html("<br>Estado")
		}, 500)
	},
	beatify_repayment_table: function(frm) {
		setTimeout(function() {

			// let's prepare the repayment table's apereance for the customer
			fields = $("[data-fieldname=repayment_schedule] [data-fieldname=estado]")

			// ok, now let's iterate over each row
			$.each(fields, function(idx, value){
				var field = $(value)
				var text = field.text()

				if(text == "SALDADA"){
					field.addClass("indicator green")
					field.text("PAID")
				} else if(text == "ABONO"){
					field.addClass("indicator blue")
					field.text("PENDING")
				} else if(text == "PENDIENTE"){
					field.addClass("indicator orange")
					field.text("UNPAID")
				} else {
					// nothing to do
				}
			})
		}, 500)
	}
})
